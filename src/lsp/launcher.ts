/**
 * LSP server lifecycle management with auto-spawning.
 *
 * Responsibilities:
 *   - Auto-spawn an LSP server when a new language file type is first encountered
 *   - Detect project root by walking up the directory tree for root pattern files
 *   - Track running servers and prevent duplicate instances per (language, root) pair
 *   - Enforce a maximum of 3 concurrent servers via LRU eviction
 *   - Graceful shutdown of all servers on process exit
 *   - Handle server crashes with a single retry
 */

import { existsSync, readdirSync } from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { type LSPAutoClient, createLSPAutoClient, type Diagnostic } from './client.js'
import { detectLanguage, getServerConfig } from './detector.js'
import type { LSPServerConfig } from './servers.js'

/** Maximum number of concurrently running LSP servers */
const MAX_CONCURRENT_SERVERS = 3

/**
 * Key that uniquely identifies a running server instance.
 * Combines language ID and project root to avoid conflicts.
 */
function serverKey(languageId: string, projectRoot: string): string {
  return `${languageId}::${projectRoot}`
}

/** Running server entry */
interface ServerEntry {
  client: LSPAutoClient
  config: LSPServerConfig
  languageId: string
  projectRoot: string
  retried: boolean
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const runningServers = new Map<string, ServerEntry>()
let cleanupRegistered = false
let shutdownInProgress = false

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

/**
 * Check if a command is available on the system PATH.
 * Uses `which` on Unix and `where` on Windows.
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  const { execFileNoThrow } = await import('../utils/execFileNoThrow.js')
  const whichCmd = process.platform === 'win32' ? 'where' : 'which'
  const result = await execFileNoThrow(whichCmd, [command], {
    timeout: 5_000,
    preserveOutputOnError: false,
    useCwd: false,
  })
  return result.code === 0
}

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

/**
 * Walk up the directory tree from `startDir` looking for any of the
 * root pattern files specified in the server config.
 *
 * @returns Absolute path to the detected project root, or startDir as fallback.
 */
export function detectProjectRoot(
  startDir: string,
  rootPatterns: string[],
): string {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root

  while (true) {
    for (const pattern of rootPatterns) {
      // Handle glob patterns like *.csproj by checking for any match
      if (pattern.includes('*')) {
        // For simple wildcard patterns, check if any matching file exists
        // We do a sync check since this runs at startup and is bounded by directory depth
        try {
          const files = readdirSync(dir)
          const regex = new RegExp(
            '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
          )
          if (files.some((f: string) => regex.test(f))) {
            return dir
          }
        } catch {
          // Directory not readable -- skip
        }
      } else {
        if (existsSync(path.join(dir, pattern))) {
          return dir
        }
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir || parent === root) {
      // Reached filesystem root without finding a pattern
      return startDir
    }
    dir = parent
  }
}

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

/**
 * Evict the least recently used server to make room for a new one.
 * Sorts by lastActivity timestamp and stops the oldest.
 */
async function evictLRU(): Promise<void> {
  if (runningServers.size < MAX_CONCURRENT_SERVERS) return

  let oldestKey: string | undefined
  let oldestTime = Infinity

  for (const [key, entry] of runningServers) {
    if (entry.client.lastActivity < oldestTime) {
      oldestTime = entry.client.lastActivity
      oldestKey = key
    }
  }

  if (oldestKey) {
    const entry = runningServers.get(oldestKey)
    runningServers.delete(oldestKey)
    if (entry) {
      try {
        await entry.client.stop()
      } catch {
        // Best-effort shutdown
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Server spawning
// ---------------------------------------------------------------------------

/**
 * Ensure there is a running LSP server for the given file.
 * If no server is configured for the file type, or the binary is not
 * installed, returns null without error.
 *
 * This is the main entry point called by notifyFileAccessed().
 */
export async function ensureServerForFile(
  filePath: string,
): Promise<LSPAutoClient | null> {
  if (shutdownInProgress) return null

  const languageId = detectLanguage(filePath)
  if (!languageId) return null

  const config = getServerConfig(languageId)
  if (!config) return null

  const fileDir = path.dirname(path.resolve(filePath))
  const projectRoot = detectProjectRoot(fileDir, config.rootPatterns)
  const key = serverKey(languageId, projectRoot)

  // Return existing server if running
  const existing = runningServers.get(key)
  if (existing && existing.client.state === 'running') {
    existing.client.touch()
    return existing.client
  }

  // If server is in error state and already retried, don't try again
  if (existing && existing.client.state === 'error' && existing.retried) {
    return null
  }

  // Check if the binary is available
  const available = await isCommandAvailable(config.command)
  if (!available) {
    return null
  }

  // Evict LRU if at capacity
  await evictLRU()

  // Create and start a new client
  const client = createLSPAutoClient(config)
  const entry: ServerEntry = {
    client,
    config,
    languageId,
    projectRoot,
    retried: existing?.retried ?? false,
  }

  // Register crash handler for single retry
  client.onCrash(async () => {
    if (!entry.retried && !shutdownInProgress) {
      entry.retried = true
      try {
        await client.stop()
        const rootUri = pathToFileURL(projectRoot).href
        await client.start(rootUri)
      } catch {
        // Retry failed -- leave in error state
        runningServers.delete(key)
      }
    } else {
      // Already retried or shutting down -- remove
      runningServers.delete(key)
    }
  })

  runningServers.set(key, entry)

  try {
    const rootUri = pathToFileURL(projectRoot).href
    await client.start(rootUri)
  } catch {
    // Start failed -- remove from map
    runningServers.delete(key)
    return null
  }

  // Register cleanup handler on first server spawn
  if (!cleanupRegistered) {
    cleanupRegistered = true
    registerCleanup(async () => {
      await shutdownAll()
    })
  }

  return client
}

// ---------------------------------------------------------------------------
// Diagnostics retrieval
// ---------------------------------------------------------------------------

/**
 * Get diagnostics for a specific file from any running server that handles it.
 */
export async function getFileDiagnostics(
  filePath: string,
): Promise<Diagnostic[]> {
  const languageId = detectLanguage(filePath)
  if (!languageId) return []

  // Find a running server that covers this file
  for (const entry of runningServers.values()) {
    if (entry.languageId === languageId && entry.client.state === 'running') {
      entry.client.touch()
      return entry.client.getDiagnostics(filePath)
    }
  }

  return []
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully shutdown all running LSP servers.
 */
export async function shutdownAll(): Promise<void> {
  shutdownInProgress = true

  const stopPromises: Promise<void>[] = []
  for (const [key, entry] of runningServers) {
    stopPromises.push(
      entry.client.stop().catch(() => {
        // Best-effort cleanup
      }),
    )
    runningServers.delete(key)
  }

  await Promise.allSettled(stopPromises)
  shutdownInProgress = false
}

/**
 * Get the number of currently running servers.
 * Primarily for testing and monitoring.
 */
export function getRunningServerCount(): number {
  return runningServers.size
}

/**
 * Get info about all running servers.
 * Primarily for testing and monitoring.
 */
export function getRunningServers(): Array<{
  languageId: string
  projectRoot: string
  state: string
}> {
  return Array.from(runningServers.values()).map(entry => ({
    languageId: entry.languageId,
    projectRoot: entry.projectRoot,
    state: entry.client.state,
  }))
}
