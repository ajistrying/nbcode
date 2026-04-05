import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { listSnapshots } from '../../snapshots/snapshot.js'

export async function call(
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  const projectRoot = getCwd()
  const snaps = listSnapshots(projectRoot)

  if (snaps.length === 0) {
    return {
      type: 'text',
      value: 'No snapshots available. Snapshots are taken automatically before file-modifying tool executions.',
    }
  }

  const lines: string[] = [`${snaps.length} snapshot(s) available (newest first):\n`]

  for (const snap of snaps) {
    const date = new Date(snap.timestamp)
    const timeStr = date.toLocaleTimeString()
    const fileCount = snap.files.length
    lines.push(`  ${snap.id} [${timeStr}] ${snap.description} (${fileCount} file${fileCount !== 1 ? 's' : ''})`)
  }

  lines.push(`\nUse /undo to revert to the last snapshot, or /undo N to go back N steps.`)

  return { type: 'text', value: lines.join('\n') }
}
