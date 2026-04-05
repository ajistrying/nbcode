import type { JSX } from '@opentui/solid'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { toInkColor } from '../../../utils/ink.js'

export type WorkerBadgeProps = {
  name: string
  color: string
}

/**
 * Renders a colored badge showing the worker's name for permission prompts.
 * Used to indicate which swarm worker is requesting the permission.
 */
export function WorkerBadge(props: WorkerBadgeProps): JSX.Element {
  const inkColor = () => toInkColor(props.color)

  return (
    <box flexDirection="row" gap={1}>
      <text fg={inkColor()}>
        {BLACK_CIRCLE} <text><b>@{props.name}</b></text>
      </text>
    </box>
  )
}
