import type { Command } from '../../commands.js'

const diagnostics = {
  type: 'local',
  name: 'diagnostics',
  description: 'Show compiler diagnostics from running language servers',
  aliases: ['diag'],
  argumentHint: '[file]',
  supportsNonInteractive: false,
  load: () => import('./diagnostics.js'),
} satisfies Command

export default diagnostics
