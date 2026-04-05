import type { Command } from '../../commands.js'

const undo = {
  type: 'local',
  name: 'undo',
  description: 'Undo file changes made by the agent (reverts to last snapshot)',
  aliases: [],
  argumentHint: '[steps]',
  supportsNonInteractive: false,
  load: () => import('./undo.js'),
} satisfies Command

export default undo
