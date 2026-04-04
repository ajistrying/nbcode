/**
 * Lightweight LSP client for auto-detection system.
 *
 * Spawns a language server as a child process communicating over
 * stdin/stdout with JSON-RPC. Implements the minimal set of LSP
 * methods needed for diagnostics:
 *
 *   - initialize / initialized handshake
 *   - textDocument/didOpen (notify server of file content)
 *   - textDocument/publishDiagnostics (receive diagnostics from server)
 *   - shutdown / exit lifecycle
 *
 * Handles server crashes with single-retry recovery.
 */

import { type ChildProcess, spawn } from 'child_process'
import * as path from 'path'
import { pathToFileURL } from 'url'
import type { LSPServerConfig } from './servers.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * LSP Diagnostic as received from the server via publishDiagnostics.
 * Minimal subset of the full LSP Diagnostic type.
 */
export interface Diagnostic {
  /** The range at which the diagnostic applies */
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  /** Severity: 1=Error, 2=Warning, 3=Information, 4=Hint */
  severity?: number
  /** Diagnostic code (string or number) */
  code?: string | number
  /** Source of the diagnostic (e.g. 'typescript', 'pyright') */
  source?: string
  /** The diagnostic message */
  message: string
}

/** State of the LSP client */
export type ClientState = 'stopped' | 'starting' | 'running' | 'error'

/** Callback for received diagnostics */
export type DiagnosticsHandler = (uri: string, diagnostics: Diagnostic[]) => void

/** Callback for client crash events */
export type CrashHandler = (error: Error) => void

// ---------------------------------------------------------------------------
// JSON-RPC framing
// ---------------------------------------------------------------------------

const CONTENT_LENGTH = 'Content-Length: '
const HEADER_DELIMITER = '\r\n\r\n'

/**
 * Encode a JSON-RPC message with Content-Length header.
 */
function encode(msg: unknown): Buffer {
  const body = JSON.stringify(msg)
  const bodyBytes = Buffer.from(body, 'utf-8')
  return Buffer.from(`${CONTENT_LENGTH}${bodyBytes.length}${HEADER_DELIMITER}${body}`, 'utf-8')
}

// ---------------------------------------------------------------------------
// LSP Client
// ---------------------------------------------------------------------------

export interface LSPAutoClient {
  readonly state: ClientState
  readonly config: LSPServerConfig
  /** Start the server process and perform initialize handshake */
  start(rootUri: string): Promise<void>
  /** Send didOpen for a file */
  openFile(filePath: string, content: string, languageId: string): Promise<void>
  /** Retrieve the latest diagnostics for a file URI */
  getDiagnostics(filePath: string): Promise<Diagnostic[]>
  /** Graceful shutdown */
  stop(): Promise<void>
  /** Register a handler to receive pushed diagnostics */
  onDiagnostics(handler: DiagnosticsHandler): void
  /** Register a handler for crash events */
  onCrash(handler: CrashHandler): void
  /** Timestamp of last activity (for LRU eviction) */
  readonly lastActivity: number
  /** Update the last activity timestamp */
  touch(): void
}

/**
 * Create an LSP auto-detection client for a given server configuration.
 */
export function createLSPAutoClient(config: LSPServerConfig): LSPAutoClient {
  let state: ClientState = 'stopped'
  let proc: ChildProcess | undefined
  let lastActivity = Date.now()

  // JSON-RPC state
  let nextRequestId = 1
  const pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()

  // Incoming message buffer
  let buffer = Buffer.alloc(0)

  // Diagnostics storage: file URI -> diagnostics
  const diagnosticStore = new Map<string, Diagnostic[]>()

  // Event handlers
  const diagnosticsHandlers: DiagnosticsHandler[] = []
  const crashHandlers: CrashHandler[] = []

  // Track opened files to avoid duplicate didOpen
  const openedFiles = new Set<string>()

  // Whether we intentionally stopped (vs crashed)
  let isStopping = false

  // ---------------------------------------------------------------------------
  // JSON-RPC message parsing
  // ---------------------------------------------------------------------------

  function processBuffer(): void {
    while (true) {
      const headerEnd = buffer.indexOf(HEADER_DELIMITER)
      if (headerEnd === -1) break

      const headerStr = buffer.subarray(0, headerEnd).toString('utf-8')
      const match = headerStr.match(/Content-Length:\s*(\d+)/)
      if (!match) {
        // Malformed header -- skip past it
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(match[1]!, 10)
      const totalLength = headerEnd + 4 + contentLength

      if (buffer.length < totalLength) {
        // Not enough data yet
        break
      }

      const bodyStr = buffer.subarray(headerEnd + 4, totalLength).toString('utf-8')
      buffer = buffer.subarray(totalLength)

      try {
        const msg = JSON.parse(bodyStr)
        handleMessage(msg)
      } catch {
        // Malformed JSON -- skip
      }
    }
  }

  function handleMessage(msg: {
    id?: number
    method?: string
    params?: unknown
    result?: unknown
    error?: { code: number; message: string }
  }): void {
    // Response to a request we sent
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      const pending = pendingRequests.get(msg.id)!
      pendingRequests.delete(msg.id)

      if (msg.error) {
        pending.reject(new Error(`LSP error ${msg.error.code}: ${msg.error.message}`))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    // Notification from server
    if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
      const params = msg.params as { uri: string; diagnostics: Diagnostic[] }
      diagnosticStore.set(params.uri, params.diagnostics)
      for (const handler of diagnosticsHandlers) {
        try {
          handler(params.uri, params.diagnostics)
        } catch {
          // Don't let handler errors break the message loop
        }
      }
      return
    }

    // Server-initiated requests that need a response
    if (msg.id !== undefined && msg.method) {
      // Respond to workspace/configuration with empty configs
      if (msg.method === 'workspace/configuration') {
        const items = (msg.params as { items?: unknown[] })?.items ?? []
        sendMessage({ jsonrpc: '2.0', id: msg.id, result: items.map(() => null) })
        return
      }

      // Respond to client/registerCapability with success (dynamic registration)
      if (msg.method === 'client/registerCapability') {
        sendMessage({ jsonrpc: '2.0', id: msg.id, result: null })
        return
      }

      // Unknown server request -- respond with method not found
      sendMessage({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: 'Method not found' },
      })
    }

    // Other notifications (window/logMessage, etc.) -- silently ignore
  }

  // ---------------------------------------------------------------------------
  // Message sending
  // ---------------------------------------------------------------------------

  function sendMessage(msg: unknown): void {
    if (!proc?.stdin?.writable) return
    try {
      proc.stdin.write(encode(msg))
    } catch {
      // Process might be dead
    }
  }

  function sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++
      pendingRequests.set(id, { resolve, reject })

      sendMessage({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id)
          reject(new Error(`LSP request '${method}' timed out after 30s`))
        }
      }, 30_000)
    })
  }

  function sendNotification(method: string, params: unknown): void {
    sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async function start(rootUri: string): Promise<void> {
    if (state === 'running' || state === 'starting') return

    state = 'starting'
    isStopping = false
    lastActivity = Date.now()

    try {
      proc = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      })

      if (!proc.stdout || !proc.stdin) {
        throw new Error('Server process stdio not available')
      }

      // Wait for spawn event to confirm process started
      await new Promise<void>((resolve, reject) => {
        const onSpawn = (): void => {
          cleanup()
          resolve()
        }
        const onError = (error: Error): void => {
          cleanup()
          reject(error)
        }
        const cleanup = (): void => {
          proc!.removeListener('spawn', onSpawn)
          proc!.removeListener('error', onError)
        }
        proc!.once('spawn', onSpawn)
        proc!.once('error', onError)
      })

      // Wire up stdout for JSON-RPC messages
      proc.stdout.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        processBuffer()
      })

      // Silently capture stderr
      proc.stderr?.on('data', () => {
        // LSP servers often write progress/debug info to stderr -- ignore
      })

      // Handle stdin errors
      proc.stdin.on('error', () => {
        // Stdin may error when process exits -- ignore if stopping
      })

      // Handle unexpected exit
      proc.on('exit', (code) => {
        if (!isStopping && code !== 0 && code !== null) {
          state = 'error'
          const crashError = new Error(
            `${config.displayName} LSP server crashed with exit code ${code}`,
          )
          for (const handler of crashHandlers) {
            try {
              handler(crashError)
            } catch {
              // Don't let handler errors propagate
            }
          }
        }
      })

      proc.on('error', (error) => {
        if (!isStopping) {
          state = 'error'
          for (const handler of crashHandlers) {
            try {
              handler(error)
            } catch {
              // Don't let handler errors propagate
            }
          }
        }
      })

      // Perform LSP initialize handshake
      const rootPath = rootUri.startsWith('file://')
        ? rootUri.replace('file://', '')
        : rootUri

      const initResult = await sendRequest('initialize', {
        processId: process.pid,
        rootUri: rootUri.startsWith('file://') ? rootUri : pathToFileURL(rootUri).href,
        rootPath,
        workspaceFolders: [
          {
            uri: rootUri.startsWith('file://') ? rootUri : pathToFileURL(rootUri).href,
            name: path.basename(rootPath),
          },
        ],
        initializationOptions: config.initializationOptions ?? {},
        capabilities: {
          workspace: {
            configuration: false,
            workspaceFolders: false,
          },
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: true,
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
              versionSupport: false,
              codeDescriptionSupport: true,
              dataSupport: false,
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ['markdown', 'plaintext'],
            },
            definition: {
              dynamicRegistration: false,
              linkSupport: true,
            },
            references: {
              dynamicRegistration: false,
            },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true,
            },
          },
          general: {
            positionEncodings: ['utf-16'],
          },
        },
      })

      if (!initResult) {
        throw new Error('Server returned empty initialize result')
      }

      // Send initialized notification
      sendNotification('initialized', {})

      state = 'running'
      lastActivity = Date.now()
    } catch (error) {
      state = 'error'
      // Clean up the process
      if (proc) {
        try {
          proc.kill()
        } catch {
          // Process may already be dead
        }
        proc = undefined
      }
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(error instanceof Error ? error : new Error(String(error)))
        pendingRequests.delete(id)
      }
      throw error
    }
  }

  async function stop(): Promise<void> {
    if (state === 'stopped') return

    isStopping = true

    try {
      if (state === 'running') {
        // Try graceful shutdown
        await sendRequest('shutdown', null).catch(() => {})
        sendNotification('exit', null)
      }
    } catch {
      // Ignore shutdown errors
    } finally {
      // Force-kill if still alive
      if (proc) {
        proc.removeAllListeners('exit')
        proc.removeAllListeners('error')
        proc.stdout?.removeAllListeners('data')
        proc.stderr?.removeAllListeners('data')
        proc.stdin?.removeAllListeners('error')
        try {
          proc.kill()
        } catch {
          // Already dead
        }
        proc = undefined
      }

      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error('Client stopped'))
        pendingRequests.delete(id)
      }

      buffer = Buffer.alloc(0)
      openedFiles.clear()
      diagnosticStore.clear()
      state = 'stopped'
      isStopping = false
    }
  }

  async function openFile(
    filePath: string,
    content: string,
    languageId: string,
  ): Promise<void> {
    if (state !== 'running') return

    const uri = pathToFileURL(path.resolve(filePath)).href

    if (openedFiles.has(uri)) {
      // Send didChange instead for already-opened files
      sendNotification('textDocument/didChange', {
        textDocument: { uri, version: Date.now() },
        contentChanges: [{ text: content }],
      })
      return
    }

    sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    })
    openedFiles.add(uri)
    lastActivity = Date.now()
  }

  async function getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const uri = pathToFileURL(path.resolve(filePath)).href
    lastActivity = Date.now()
    return diagnosticStore.get(uri) ?? []
  }

  return {
    get state() {
      return state
    },
    config,
    start,
    openFile,
    getDiagnostics,
    stop,
    onDiagnostics(handler: DiagnosticsHandler) {
      diagnosticsHandlers.push(handler)
    },
    onCrash(handler: CrashHandler) {
      crashHandlers.push(handler)
    },
    get lastActivity() {
      return lastActivity
    },
    touch() {
      lastActivity = Date.now()
    },
  }
}
