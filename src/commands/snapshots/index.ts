import type { Command } from '../../commands.js'

const snapshots = {
  type: 'local',
  name: 'snapshots',
  description: 'List available file snapshots (use /undo to revert)',
  aliases: [],
  argumentHint: '',
  supportsNonInteractive: false,
  load: () => import('./snapshots.js'),
} satisfies Command

export default snapshots
