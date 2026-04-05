import * as path from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import {
  getFileDiagnostics,
  getAccessedFiles,
  getRunningServers,
  type Diagnostic,
} from '../../lsp/index.js'

/**
 * Map LSP severity numbers to human-readable labels.
 * LSP spec: 1=Error, 2=Warning, 3=Information, 4=Hint
 */
function severityLabel(severity?: number): string {
  switch (severity) {
    case 1:
      return 'error'
    case 2:
      return 'warning'
    case 3:
      return 'info'
    case 4:
      return 'hint'
    default:
      return 'unknown'
  }
}

/**
 * Format a single diagnostic as "file:line:col severity message".
 */
function formatDiagnostic(filePath: string, diag: Diagnostic): string {
  const line = diag.range.start.line + 1 // LSP lines are 0-based
  const col = diag.range.start.character + 1
  const sev = severityLabel(diag.severity)
  const source = diag.source ? ` [${diag.source}]` : ''
  return `${filePath}:${line}:${col} ${sev}${source} ${diag.message}`
}

export const call: LocalCommandCall = async args => {
  const filePaths: string[] = []

  if (args.trim()) {
    // User provided a specific file
    filePaths.push(path.resolve(args.trim()))
  } else {
    // Show diagnostics for all files accessed this session
    const accessed = getAccessedFiles()
    if (accessed.size === 0) {
      const servers = getRunningServers()
      if (servers.length === 0) {
        return {
          type: 'text',
          value:
            'No LSP servers are running. Diagnostics will become available after reading or editing files in a project with a supported language server installed.',
        }
      }
      return {
        type: 'text',
        value:
          'No files have been accessed yet. Use Read/Edit/Write tools on source files to collect diagnostics.',
      }
    }
    filePaths.push(...Array.from(accessed))
  }

  const lines: string[] = []

  for (const filePath of filePaths) {
    try {
      const diagnostics = await getFileDiagnostics(filePath)
      for (const diag of diagnostics) {
        lines.push(formatDiagnostic(filePath, diag))
      }
    } catch {
      // Skip files that fail -- LSP errors should not propagate
    }
  }

  if (lines.length === 0) {
    const servers = getRunningServers()
    if (servers.length === 0) {
      return {
        type: 'text',
        value:
          'No LSP servers are running. Diagnostics will become available after reading or editing files in a project with a supported language server installed.',
      }
    }
    return {
      type: 'text',
      value: `No diagnostics found. ${servers.length} language server(s) running: ${servers.map(s => s.languageId).join(', ')}`,
    }
  }

  // Sort: errors first, then warnings, then others
  lines.sort((a, b) => {
    const sevOrder = (line: string): number => {
      if (line.includes(' error')) return 0
      if (line.includes(' warning')) return 1
      return 2
    }
    return sevOrder(a) - sevOrder(b)
  })

  const errorCount = lines.filter(l => l.includes(' error')).length
  const warningCount = lines.filter(l => l.includes(' warning')).length
  const summary = `${lines.length} diagnostic(s): ${errorCount} error(s), ${warningCount} warning(s)`

  return {
    type: 'text',
    value: `${lines.join('\n')}\n\n${summary}`,
  }
}
