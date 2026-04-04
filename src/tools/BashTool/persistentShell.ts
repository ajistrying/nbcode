/**
 * PersistentShell — a single long-lived shell process that persists across
 * tool invocations. Environment variables, cwd changes, virtualenvs, and
 * shell state survive between commands.
 *
 * Design:
 * - One shell process for the session lifetime (singleton via getInstance())
 * - Commands are written to stdin; stdout/stderr are read back using unique
 *   sentinel markers to delimit each command's output
 * - Timeout kills the running command (via process-group kill), not the shell
 * - AbortSignal support for cancellation
 * - Automatic respawn if the shell process crashes
 * - Graceful shutdown via cleanupRegistry
 *
 * This is ADDITIVE — the existing exec()-per-invocation path in Shell.ts is
 * unchanged. Callers opt in by using PersistentShell.getInstance().execute().
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { logForDebugging } from '../../utils/debug.js'
import { findSuitableShell } from '../../utils/Shell.js'
import { subprocessEnv } from '../../utils/subprocessEnv.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersistentShellExecOptions = {
  /** Command timeout in milliseconds. Default: 120_000 (2 min). */
  timeout?: number
  /** AbortSignal for cancellation. */
  abortSignal?: AbortSignal
}

export type PersistentShellResult = {
  stdout: string
  stderr: string
  exitCode: number
}

// ---------------------------------------------------------------------------
// Sentinel helpers
// ---------------------------------------------------------------------------

/** Generate a unique marker that will not appear in normal command output. */
function makeSentinel(): string {
  return `__PERSISTENT_SHELL_${randomBytes(16).toString('hex')}__`
}

const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes
const SHELL_STARTUP_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// PersistentShell
// ---------------------------------------------------------------------------

export class PersistentShell {
  // Singleton
  private static instance: PersistentShell | null = null
  private static cleanupRegistered = false

  private shellProcess: ChildProcess | null = null
  private shellPath: string | null = null

  // Queued command state — only one command runs at a time
  private busy = false
  private commandQueue: Array<{
    command: string
    options: PersistentShellExecOptions
    resolve: (result: PersistentShellResult) => void
    reject: (err: Error) => void
  }> = []

  // Buffer state for current command
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private currentSentinel: string | null = null
  private currentResolve: ((result: PersistentShellResult) => void) | null =
    null
  private currentReject: ((err: Error) => void) | null = null
  private currentTimeoutId: ReturnType<typeof setTimeout> | null = null
  private currentAbortHandler: (() => void) | null = null
  private currentAbortSignal: AbortSignal | null = null
  private interruptForceResolveTimeout: ReturnType<typeof setTimeout> | null =
    null
  /** Set when a command is being interrupted, so checkForCompletion can
   *  override exit code and stderr. */
  private interruptReason: 'timeout' | 'abort' | null = null

  private _isShuttingDown = false

  // -------------------------------------------------------------------------
  // Singleton access
  // -------------------------------------------------------------------------

  /**
   * Get or create the singleton PersistentShell instance.
   * The shell process is NOT started until the first execute() call.
   */
  static getInstance(): PersistentShell {
    if (!PersistentShell.instance) {
      PersistentShell.instance = new PersistentShell()
    }
    return PersistentShell.instance
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    if (PersistentShell.instance) {
      PersistentShell.instance.shutdown()
      PersistentShell.instance = null
    }
  }

  private constructor() {
    // Register cleanup on first construction
    if (!PersistentShell.cleanupRegistered) {
      PersistentShell.cleanupRegistered = true
      registerCleanup(async () => {
        PersistentShell.instance?.shutdown()
      })
    }
  }

  // -------------------------------------------------------------------------
  // Shell lifecycle
  // -------------------------------------------------------------------------

  /** Start (or restart) the underlying shell process. */
  private async ensureShell(): Promise<void> {
    if (this.shellProcess && !this.isShellDead()) {
      return
    }

    // Resolve shell binary if we haven't yet
    if (!this.shellPath) {
      this.shellPath = await findSuitableShell()
    }

    logForDebugging(
      `PersistentShell: spawning ${this.shellPath} (pid will follow)`,
    )

    // Build shell-appropriate flags to skip rc files.
    // bash uses --norc --noprofile; zsh uses -f (NO_RCS).
    // Do NOT use -i (interactive) — it enables job control and prompts that
    // interfere with sentinel-based output parsing.
    const isZsh = this.shellPath.includes('zsh')
    const shellArgs = isZsh ? ['-f'] : ['--norc', '--noprofile']

    const child = spawn(this.shellPath, shellArgs, {
      env: {
        ...subprocessEnv(),
        SHELL: this.shellPath,
        GIT_EDITOR: 'true',
        CLAUDECODE: '1',
        // Disable prompts/hooks that could interfere with sentinel parsing
        PS1: '',
        PS2: '',
        PS0: '',
        PROMPT_COMMAND: '',
        // Disable zsh-specific prompt themes
        PROMPT: '',
        RPROMPT: '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Don't detach — we want to be able to kill child commands via the shell
      detached: false,
      windowsHide: true,
    })

    this.shellProcess = child

    logForDebugging(`PersistentShell: spawned pid=${child.pid}`)

    // Wire up stdout/stderr listeners
    child.stdout?.setEncoding('utf-8')
    child.stderr?.setEncoding('utf-8')

    child.stdout?.on('data', (chunk: string) => {
      this.onStdoutData(chunk)
    })

    child.stderr?.on('data', (chunk: string) => {
      this.onStderrData(chunk)
    })

    // Capture a reference to this specific child so the exit handler doesn't
    // clobber a replacement shell spawned after shutdown()+respawn.
    const thisChild = child
    child.on('exit', (code, signal) => {
      logForDebugging(
        `PersistentShell: process exited code=${code} signal=${signal}`,
      )
      if (this.shellProcess === thisChild) {
        this.onShellExit()
      }
    })

    child.on('error', (err) => {
      logForDebugging(`PersistentShell: process error: ${err.message}`)
      if (this.shellProcess === thisChild) {
        this.onShellExit()
      }
    })

    // Wait for the shell to be ready by echoing a startup sentinel
    await this.waitForStartup()

    // Override `exit` so it doesn't kill the persistent shell.
    // Instead, it sets __ps_exit_code and returns, which `eval` will propagate
    // as the exit status. This preserves env/cwd changes from the command.
    this.shellProcess!.stdin!.write(
      'exit() { return "${1:-0}"; }\n',
    )
  }

  /** Wait for the shell to respond to a startup probe. */
  private waitForStartup(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const sentinel = makeSentinel()
      let startupBuffer = ''

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('PersistentShell: shell startup timed out'))
      }, SHELL_STARTUP_TIMEOUT_MS)

      const onData = (chunk: string): void => {
        startupBuffer += chunk
        if (startupBuffer.includes(sentinel)) {
          cleanup()
          resolve()
        }
      }

      const cleanup = (): void => {
        clearTimeout(timeout)
        this.shellProcess?.stdout?.removeListener('data', onData)
      }

      this.shellProcess?.stdout?.on('data', onData)

      // Write a simple echo to confirm the shell is alive
      this.shellProcess?.stdin?.write(`echo '${sentinel}'\n`)
    })
  }

  private isShellDead(): boolean {
    if (!this.shellProcess) return true
    // exitCode is set once the process exits; killed means we sent a signal
    return this.shellProcess.exitCode !== null || this.shellProcess.killed
  }

  private onShellExit(): void {
    this.shellProcess = null

    // If we were in the middle of a command, reject it
    if (this.currentReject) {
      this.cleanupCurrentCommand()
      this.currentReject(
        new Error('PersistentShell: shell process exited unexpectedly'),
      )
      this.currentResolve = null
      this.currentReject = null
      this.busy = false
      // Attempt to drain the queue (next command will respawn)
      this.drainQueue()
    }
  }

  // -------------------------------------------------------------------------
  // stdout / stderr data handlers
  // -------------------------------------------------------------------------

  private onStdoutData(chunk: string): void {
    if (!this.currentSentinel) return
    this.stdoutBuffer += chunk
    this.checkForCompletion()
  }

  private onStderrData(chunk: string): void {
    if (!this.currentSentinel) return
    this.stderrBuffer += chunk
    // stderr doesn't carry the completion sentinel — just buffer it.
    // Completion is detected from stdout only.
  }

  /**
   * Check if the current command has completed by looking for the exit-code
   * sentinel in stdout.
   *
   * The command wrapper writes:
   *   <sentinel>:<exit_code>
   * to stdout after the command finishes.
   */
  private checkForCompletion(): void {
    if (!this.currentSentinel || !this.currentResolve) return

    const marker = this.currentSentinel + ':'
    const idx = this.stdoutBuffer.indexOf(marker)
    if (idx === -1) return

    // Extract exit code from the sentinel line
    const afterMarker = this.stdoutBuffer.slice(idx + marker.length)
    const newlineIdx = afterMarker.indexOf('\n')
    if (newlineIdx === -1) return // sentinel line not yet complete

    const exitCodeStr = afterMarker.slice(0, newlineIdx).trim()
    const exitCode = parseInt(exitCodeStr, 10)

    // Everything before the sentinel marker is command stdout
    const stdout = this.stdoutBuffer.slice(0, idx)

    // stderr buffer is the full stderr for this command
    // The stderr sentinel marks the end of stderr output
    const stderrSentinel = this.currentSentinel + '_STDERR'
    let stderr = this.stderrBuffer
    const stderrIdx = stderr.indexOf(stderrSentinel)
    if (stderrIdx !== -1) {
      stderr = stderr.slice(0, stderrIdx)
    }

    const resolve = this.currentResolve
    const interruptReason = this.interruptReason
    this.cleanupCurrentCommand()
    this.currentResolve = null
    this.currentReject = null
    this.busy = false

    // If the command was interrupted (timeout/abort), override exit code and
    // append a message to stderr so callers can distinguish.
    let finalExitCode = isNaN(exitCode) ? 1 : exitCode
    let finalStderr = stderr.replace(/\n$/, '')
    if (interruptReason === 'timeout') {
      finalExitCode = 124 // standard timeout exit code
      const msg = 'Command timed out'
      finalStderr = finalStderr ? `${finalStderr}\n${msg}` : msg
    } else if (interruptReason === 'abort') {
      finalExitCode = 130 // standard SIGINT exit code
      const msg = 'Command aborted'
      finalStderr = finalStderr ? `${finalStderr}\n${msg}` : msg
    }

    resolve({
      stdout: stdout.replace(/\n$/, ''), // trim trailing newline from echo
      stderr: finalStderr,
      exitCode: finalExitCode,
    })

    // Process next queued command
    this.drainQueue()
  }

  // -------------------------------------------------------------------------
  // Command execution
  // -------------------------------------------------------------------------

  /**
   * Execute a command in the persistent shell.
   *
   * Commands are serialized — if a command is already running, this one
   * is queued and will execute after the current one completes.
   */
  async execute(
    command: string,
    options: PersistentShellExecOptions = {},
  ): Promise<PersistentShellResult> {
    if (this._isShuttingDown) {
      return { stdout: '', stderr: 'Shell is shutting down', exitCode: 1 }
    }

    // Ensure the shell is alive
    await this.ensureShell()

    return new Promise<PersistentShellResult>((resolve, reject) => {
      this.commandQueue.push({ command, options, resolve, reject })
      this.drainQueue()
    })
  }

  private drainQueue(): void {
    if (this.busy || this.commandQueue.length === 0) return
    const next = this.commandQueue.shift()!
    this.busy = true
    this.executeImmediate(next.command, next.options, next.resolve, next.reject)
  }

  /**
   * Internal: run a single command immediately (caller guarantees !busy).
   */
  private executeImmediate(
    command: string,
    options: PersistentShellExecOptions,
    resolve: (result: PersistentShellResult) => void,
    reject: (err: Error) => void,
  ): void {
    if (this.isShellDead()) {
      // Shell died between queueing and execution — reject so caller can retry
      this.busy = false
      reject(new Error('PersistentShell: shell process is not running'))
      return
    }

    const sentinel = makeSentinel()
    const stderrSentinel = sentinel + '_STDERR'
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS

    this.currentSentinel = sentinel
    this.currentResolve = resolve
    this.currentReject = reject
    this.stdoutBuffer = ''
    this.stderrBuffer = ''

    // Timeout: kill the running command via SIGINT to the foreground process
    // group, but keep the shell alive
    this.currentTimeoutId = setTimeout(() => {
      this.handleCommandTimeout()
    }, timeoutMs)

    // AbortSignal: interrupt the command on abort
    if (options.abortSignal) {
      this.currentAbortSignal = options.abortSignal
      this.currentAbortHandler = () => {
        this.handleCommandAbort()
      }
      options.abortSignal.addEventListener('abort', this.currentAbortHandler, {
        once: true,
      })
    }

    // Write the command to stdin with sentinel bookends.
    //
    // Design goals:
    // - env vars, cwd, aliases set by the command PERSIST across invocations
    //   (this is the whole point of a persistent shell)
    // - `exit N` is intercepted by our override function (see ensureShell)
    // - exit code is captured and reported via the sentinel
    //
    // The command runs via `eval` directly in the parent shell (no subshell),
    // so all side effects (export, cd, source) persist. The `|| true` pattern
    // ensures the sentinel always fires even if the command fails.
    const wrappedCommand = [
      // Run the command directly; capture exit code
      `eval ${this.shellQuote(command)}`,
      // Capture exit code (works with both success and failure)
      `__ps_ec=$?`,
      // Write stderr sentinel (goes to fd 2)
      `echo '${stderrSentinel}' >&2`,
      // Write stdout sentinel + exit code (goes to fd 1)
      `echo '${sentinel}:'$__ps_ec`,
    ].join('\n')

    this.shellProcess!.stdin!.write(wrappedCommand + '\n')
  }

  /**
   * Interrupt the current command.
   *
   * Strategy: kill all child processes of the shell process using
   * `pkill -P <shell_pid>`. This terminates whatever the shell is executing
   * (sleep, build, etc.) without killing the shell itself. After the children
   * die, the shell's `eval` returns, `$?` is set, and the sentinel fires.
   *
   * If the sentinel doesn't arrive within INTERRUPT_GRACE_MS (e.g., the
   * command trapped SIGTERM), we force-resolve to avoid hanging.
   */
  private interruptCurrentCommand(reason: 'timeout' | 'abort'): void {
    if (!this.currentSentinel || !this.currentResolve) return
    logForDebugging(`PersistentShell: command ${reason}`)
    this.interruptReason = reason

    const shellPid = this.shellProcess?.pid
    if (shellPid) {
      // Kill all child processes of the shell. This terminates the running
      // command (which eval is waiting on) without killing the shell itself.
      // `pkill -INT -P <pid>` sends SIGINT to all direct children of the shell.
      // After the children die, eval returns with exit code 130, and the
      // sentinel echo fires normally.
      try {
        execSync(`pkill -INT -P ${shellPid}`, { timeout: 1000 })
      } catch {
        // pkill returns non-zero if no processes matched (already exited)
        // or if the shell is dead — both are fine.
      }
    }

    // Set up a safety net: if the sentinel doesn't arrive within the grace
    // period, force-resolve so we don't hang forever.
    const INTERRUPT_GRACE_MS = 2000
    const forceResolveTimeout = setTimeout(() => {
      if (this.currentResolve) {
        const resolve = this.currentResolve
        const stdout = this.stdoutBuffer
        const stderr = this.stderrBuffer
        this.cleanupCurrentCommand()
        this.currentResolve = null
        this.currentReject = null
        this.busy = false

        const msg =
          reason === 'timeout' ? 'Command timed out' : 'Command aborted'
        const exitCode = reason === 'timeout' ? 124 : 130

        resolve({
          stdout,
          stderr: stderr ? `${stderr}\n${msg}` : msg,
          exitCode,
        })
        this.drainQueue()
      }
    }, INTERRUPT_GRACE_MS)

    // If checkForCompletion fires normally (sentinel arrives), the force
    // timeout above becomes a no-op since currentResolve will be null.
    // Store it so cleanupCurrentCommand can clear it.
    this.interruptForceResolveTimeout = forceResolveTimeout
  }

  /** Kill the running command on timeout, keep the shell alive. */
  private handleCommandTimeout(): void {
    this.interruptCurrentCommand('timeout')
  }

  /** Kill the running command on abort. */
  private handleCommandAbort(): void {
    this.interruptCurrentCommand('abort')
  }

  /** Clean up timers and abort listener for the current command. */
  private cleanupCurrentCommand(): void {
    if (this.currentTimeoutId) {
      clearTimeout(this.currentTimeoutId)
      this.currentTimeoutId = null
    }
    if (this.interruptForceResolveTimeout) {
      clearTimeout(this.interruptForceResolveTimeout)
      this.interruptForceResolveTimeout = null
    }
    if (this.currentAbortHandler && this.currentAbortSignal) {
      this.currentAbortSignal.removeEventListener(
        'abort',
        this.currentAbortHandler,
      )
      this.currentAbortHandler = null
      this.currentAbortSignal = null
    }
    this.currentSentinel = null
    this.interruptReason = null
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /** Get the current working directory of the shell. */
  async getCwd(): Promise<string> {
    if (this.isShellDead()) {
      throw new Error('PersistentShell: shell is not running')
    }
    const result = await this.execute('pwd -P')
    return result.stdout.trim()
  }

  /** Check if the shell process is alive. */
  isAlive(): boolean {
    return !this.isShellDead()
  }

  /**
   * Shutdown the persistent shell. The instance can still be used after
   * shutdown — it will respawn on the next execute() call.
   */
  shutdown(): void {
    this._isShuttingDown = true
    this.cleanupCurrentCommand()

    // Reject any queued commands
    for (const queued of this.commandQueue) {
      queued.reject(new Error('PersistentShell: shutting down'))
    }
    this.commandQueue = []

    if (this.shellProcess) {
      try {
        this.shellProcess.stdin?.end()
        this.shellProcess.kill('SIGTERM')
      } catch {
        // Process may already be dead
      }
      this.shellProcess = null
    }

    this.currentResolve = null
    this.currentReject = null
    this.busy = false
    this._isShuttingDown = false
  }

  /**
   * Shell-quote a string for safe embedding in a command.
   * Uses single quotes with proper escaping.
   */
  private shellQuote(s: string): string {
    // Wrap in single quotes, escaping any internal single quotes
    // 'foo'\''bar' => foo'bar in bash
    return "'" + s.replace(/'/g, "'\\''") + "'"
  }
}
