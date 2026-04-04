/**
 * Smoke tests for PersistentShell.
 *
 * Run with: bun test src/tools/BashTool/persistentShell.test.ts
 */

import { describe, it, expect, afterEach } from 'bun:test'
import { PersistentShell } from './persistentShell.js'

afterEach(() => {
  PersistentShell.resetInstance()
})

describe('PersistentShell', () => {
  it('executes a simple command', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute('echo hello')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello')
  })

  it('preserves environment variables across invocations', async () => {
    const shell = PersistentShell.getInstance()
    await shell.execute('export MY_TEST_VAR=persistent_value_42')
    const result = await shell.execute('echo $MY_TEST_VAR')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('persistent_value_42')
  })

  it('preserves working directory across invocations', async () => {
    const shell = PersistentShell.getInstance()
    await shell.execute('cd /tmp')
    const result = await shell.execute('pwd')
    expect(result.exitCode).toBe(0)
    // /tmp may resolve to /private/tmp on macOS
    expect(result.stdout).toMatch(/\/tmp|\/private\/tmp/)
  })

  it('captures stderr', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute('echo error_output >&2')
    expect(result.stderr).toContain('error_output')
  })

  it('reports non-zero exit codes', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute('exit 42')
    expect(result.exitCode).toBe(42)
  })

  it('handles multi-line output', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute('echo "line1\nline2\nline3"')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('line1')
    expect(result.stdout).toContain('line3')
  })

  it('handles commands with special characters', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute(
      'echo "hello world" | grep -o "world"',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('world')
  })

  it('returns singleton instance', () => {
    const a = PersistentShell.getInstance()
    const b = PersistentShell.getInstance()
    expect(a).toBe(b)
  })

  it('handles timeout', async () => {
    const shell = PersistentShell.getInstance()
    const result = await shell.execute('sleep 30', { timeout: 1000 })
    expect(result.exitCode).toBe(124) // timeout exit code
    expect(result.stderr).toContain('timed out')
  }, 10000)

  it('handles abort signal', async () => {
    const shell = PersistentShell.getInstance()
    const controller = new AbortController()

    // Abort after 500ms
    setTimeout(() => controller.abort(), 500)

    const result = await shell.execute('sleep 30', {
      abortSignal: controller.signal,
    })
    expect(result.exitCode).toBe(130) // SIGINT exit code
    expect(result.stderr).toContain('aborted')
  }, 10000)

  it('can execute commands after timeout', async () => {
    const shell = PersistentShell.getInstance()

    // First: timeout
    await shell.execute('sleep 30', { timeout: 1000 })

    // Then: should still work
    const result = await shell.execute('echo still_alive')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('still_alive')
  }, 15000)

  it('getCwd returns the shell working directory', async () => {
    const shell = PersistentShell.getInstance()
    await shell.execute('cd /tmp')
    const cwd = await shell.getCwd()
    expect(cwd).toMatch(/\/tmp|\/private\/tmp/)
  })

  it('handles shutdown and respawn', async () => {
    const shell = PersistentShell.getInstance()
    const result1 = await shell.execute('echo before_shutdown')
    expect(result1.stdout).toContain('before_shutdown')

    shell.shutdown()

    // After shutdown, execute should respawn
    // Note: shutdown sets _isShuttingDown temporarily, then resets it
    const result2 = await shell.execute('echo after_shutdown')
    expect(result2.exitCode).toBe(0)
    expect(result2.stdout).toContain('after_shutdown')
  })
})
