import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { getSnapshotCount, undoLastN } from '../../snapshots/snapshot.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  const projectRoot = getCwd()
  const count = getSnapshotCount(projectRoot)

  if (count === 0) {
    return {
      type: 'text',
      value: 'No snapshots available. Snapshots are taken automatically before file-modifying tool executions.',
    }
  }

  const steps = args.trim() ? parseInt(args.trim(), 10) : 1
  if (isNaN(steps) || steps < 1) {
    return {
      type: 'text',
      value: `Invalid step count. Usage: /undo [steps]\nAvailable snapshots: ${count}`,
    }
  }

  if (steps > count) {
    return {
      type: 'text',
      value: `Only ${count} snapshot(s) available. Cannot undo ${steps} steps.`,
    }
  }

  const result = await undoLastN(projectRoot, steps)
  if (!result) {
    return {
      type: 'text',
      value: 'Failed to undo. The snapshot may be corrupted.',
    }
  }

  const lines: string[] = []
  lines.push(`Reverted to: ${result.snapshot.description}`)

  if (result.restored.length > 0) {
    lines.push(`\nRestored ${result.restored.length} file(s):`)
    for (const f of result.restored) {
      lines.push(`  - ${f}`)
    }
  }

  if (result.deleted.length > 0) {
    lines.push(`\nDeleted ${result.deleted.length} new file(s):`)
    for (const f of result.deleted) {
      lines.push(`  - ${f}`)
    }
  }

  const remaining = getSnapshotCount(projectRoot)
  lines.push(`\n${remaining} snapshot(s) remaining.`)

  return { type: 'text', value: lines.join('\n') }
}
