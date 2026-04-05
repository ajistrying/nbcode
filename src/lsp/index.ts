/**
 * LSP Auto-Detection System
 *
 * Provides automatic language server spawning when files of a supported
 * type are accessed by the AI agent. Gives the agent access to real
 * compiler diagnostics without requiring manual LSP configuration.
 *
 * Usage:
 *
 *   import { notifyFileAccessed, getFileDiagnostics, shutdownAll } from '../lsp/index.js'
 *
 *   // Call when read/edit tools touch a file -- spawns LSP if needed
 *   await notifyFileAccessed('/path/to/file.ts')
 *
 *   // Retrieve diagnostics (errors, warnings) for a file
 *   const diagnostics = await getFileDiagnostics('/path/to/file.ts')
 *
 *   // Shutdown all running servers (called automatically on process exit)
 *   await shutdownAll()
 *
 * LSP servers must be installed by the user. The system detects whether
 * the binary is available before attempting to spawn. At most 3 servers
 * run concurrently (LRU eviction for the oldest when a 4th is needed).
 */

import { readFile } from 'fs/promises'
import * as path from 'path'
import { detectLanguage } from './detector.js'
import {
  ensureServerForFile,
  getFileDiagnostics as launcherGetFileDiagnostics,
  shutdownAll as launcherShutdownAll,
} from './launcher.js'
import type { Diagnostic } from './client.js'

// Re-exports for consumers
export type { Diagnostic } from './client.js'
export type { LSPServerConfig } from './servers.js'
export { registerCustomServer, clearCustomServers } from './servers.js'
export { detectLanguage, getServerConfig, getServerConfigForFile } from './detector.js'
export { getRunningServerCount, getRunningServers, detectProjectRoot } from './launcher.js'

// Track all files that have been accessed during this session.
// Used by /diagnostics to show diagnostics for all touched files.
const accessedFiles = new Set<string>()

/**
 * Get the set of all file paths accessed during this session.
 */
export function getAccessedFiles(): ReadonlySet<string> {
  return accessedFiles
}

/**
 * Notify the LSP system that a file has been accessed (read or edited).
 *
 * This triggers auto-spawning of the appropriate language server if:
 *   1. The file extension maps to a known language
 *   2. A server config exists for that language
 *   3. The server binary is installed on the system
 *   4. No server is already running for that language + project root
 *
 * The file content is sent to the server via textDocument/didOpen so
 * diagnostics can be computed. Subsequent calls for files that are
 * already tracked will send didChange instead.
 *
 * This function is non-blocking from the caller's perspective: if the
 * server fails to start, the error is swallowed and logged.
 *
 * @param filePath - Absolute path to the file being accessed
 * @param content  - Optional file content. If not provided, the file is read from disk.
 */
export async function notifyFileAccessed(
  filePath: string,
  content?: string,
): Promise<void> {
  try {
    // Track every accessed file for /diagnostics
    accessedFiles.add(path.resolve(filePath))

    const client = await ensureServerForFile(filePath)
    if (!client) return

    const languageId = detectLanguage(filePath)
    if (!languageId) return

    // Read file content if not provided
    let fileContent = content
    if (fileContent === undefined) {
      try {
        fileContent = await readFile(path.resolve(filePath), 'utf-8')
      } catch {
        // File may have been deleted or is unreadable -- skip
        return
      }
    }

    await client.openFile(filePath, fileContent, languageId)
  } catch {
    // Non-blocking: swallow errors from auto-detection.
    // The LSP system is an enhancement -- failures should never
    // block the main agent workflow.
  }
}

/**
 * Get compiler diagnostics for a file.
 *
 * Returns cached diagnostics from the running language server.
 * Diagnostics are pushed by the server asynchronously after
 * textDocument/didOpen or textDocument/didChange.
 *
 * Returns an empty array if:
 *   - No server is running for this file type
 *   - The server hasn't sent diagnostics yet
 *   - The file type is not recognized
 *
 * @param filePath - Absolute path to the file
 * @returns Array of diagnostics (errors, warnings, etc.)
 */
export async function getFileDiagnostics(
  filePath: string,
): Promise<Diagnostic[]> {
  try {
    return await launcherGetFileDiagnostics(filePath)
  } catch {
    return []
  }
}

/**
 * Shutdown all running LSP servers.
 *
 * Called automatically on process exit via cleanupRegistry.
 * Can also be called manually to free resources.
 */
export async function shutdownAll(): Promise<void> {
  await launcherShutdownAll()
}
