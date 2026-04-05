/**
 * Snapshot integration with tool execution.
 *
 * Takes a pre-snapshot of files before they are modified by tools.
 */

import { getCwd } from '../utils/cwd.js'
import { logError } from '../utils/log.js'
import { initSnapshotRepo, pruneSnapshots, takeSnapshot } from './snapshot.js'

// Tool names that modify files on disk
const FILE_MODIFYING_TOOLS = new Set([
  'Edit',
  'Write',
  'Bash',
  'NotebookEdit',
  'MultiEdit',
  'PowerShell',
])

// Bash commands that are read-only and don't need snapshots
const READ_ONLY_BASH_PATTERNS = [
  /^\s*(cat|head|tail|less|more|wc|file|stat)\b/,
  /^\s*(ls|dir|find|locate|which|where|whereis)\b/,
  /^\s*(grep|rg|ag|ack|fgrep|egrep)\b/,
  /^\s*(git\s+(status|log|diff|show|branch|remote|tag))\b/,
  /^\s*(echo|printf|env|printenv|set|export)\b/,
  /^\s*(pwd|whoami|hostname|uname|date|cal)\b/,
  /^\s*(node|python|ruby|go|cargo|npm|yarn|bun|pnpm)\s+(-v|--version|version)\b/,
  /^\s*(npm\s+(list|ls|info|view|search|outdated))\b/,
  /^\s*(git\s+blame)\b/,
  /^\s*(type|readlink|realpath|dirname|basename)\b/,
]

/**
 * Determine files that a tool will modify, given its name and input.
 * Returns null if the tool is read-only or we can't determine targets.
 */
function getAffectedFiles(
  toolName: string,
  input: Record<string, unknown>,
): string[] | null {
  if (!FILE_MODIFYING_TOOLS.has(toolName)) {
    return null
  }

  switch (toolName) {
    case 'Edit':
    case 'MultiEdit': {
      const filePath = input.file_path as string | undefined
      if (filePath) return [filePath]
      return null
    }
    case 'Write': {
      const filePath = input.file_path as string | undefined
      if (filePath) return [filePath]
      return null
    }
    case 'NotebookEdit': {
      const filePath = (input.notebook_path ?? input.file_path) as
        | string
        | undefined
      if (filePath) return [filePath]
      return null
    }
    case 'Bash':
    case 'PowerShell': {
      const command = input.command as string | undefined
      if (!command) return null
      for (const pattern of READ_ONLY_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return null
        }
      }
      return extractBashTargets(command)
    }
    default:
      return null
  }
}

/**
 * Best-effort extraction of file paths from bash commands.
 * Returns empty array for write commands where we can't determine targets
 * (signals "modifying but unknown files").
 */
function extractBashTargets(command: string): string[] | null {
  const files: string[] = []

  // git operations that modify files
  if (
    /\bgit\s+(checkout|reset|rebase|merge|cherry-pick|revert|stash\s+pop)\b/.test(
      command,
    )
  ) {
    return []
  }

  // rm/mv/cp
  if (/\b(rm|mv|cp|install)\s/.test(command)) {
    return []
  }

  // sed -i / awk in-place
  if (
    /\bsed\s+(-i|--in-place)\b/.test(command) ||
    /\bawk\s+-i\s+inplace\b/.test(command)
  ) {
    return []
  }

  // Redirections (> or >>)
  const redirectMatch = command.match(/(?:>>?)\s*(\S+)/g)
  if (redirectMatch) {
    for (const match of redirectMatch) {
      const target = match.replace(/>>?\s*/, '').trim()
      if (target && !target.startsWith('/dev/')) {
        files.push(target)
      }
    }
  }

  // tee
  const teeMatch = command.match(/\btee\s+(?:-a\s+)?(\S+)/g)
  if (teeMatch) {
    for (const match of teeMatch) {
      const target = match.replace(/tee\s+(-a\s+)?/, '').trim()
      if (target) files.push(target)
    }
  }

  if (files.length > 0) return files

  // Unknown whether this modifies files — skip snapshot for non-obvious commands
  return null
}

let initialized = false

/**
 * Take a pre-snapshot before a file-modifying tool executes.
 * Safe to call for any tool — no-ops for read-only tools.
 *
 * @param toolName The tool's registered name (e.g., 'Edit', 'Bash')
 * @param input The tool's parsed input object
 * @returns The snapshot ID if one was taken, or null
 */
export async function preToolSnapshot(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  const projectRoot = getCwd()
  const files = getAffectedFiles(toolName, input)

  if (files === null) {
    return null
  }

  try {
    if (!initialized) {
      await initSnapshotRepo(projectRoot)
      pruneSnapshots(projectRoot).catch(() => {})
      initialized = true
    }

    const description = `Before ${toolName}: ${summarizeInput(toolName, input)}`
    const snapshot = await takeSnapshot(projectRoot, files, description)
    return snapshot?.id ?? null
  } catch (error) {
    logError(error)
    return null // Never block tool execution
  }
}

function summarizeInput(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Edit':
    case 'Write':
      return String(input.file_path ?? 'unknown file')
    case 'NotebookEdit':
      return String(input.notebook_path ?? input.file_path ?? 'unknown notebook')
    case 'Bash':
    case 'PowerShell': {
      const cmd = String(input.command ?? '')
      return cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd
    }
    default:
      return toolName
  }
}
