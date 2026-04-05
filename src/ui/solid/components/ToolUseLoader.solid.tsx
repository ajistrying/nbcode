import type { JSX } from '@opentui/solid'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { useBlink } from '../../../hooks/useBlink.js'

type Props = {
  isError: boolean
  isUnresolved: boolean
  shouldAnimate: boolean
}

export function ToolUseLoader(props: Props): JSX.Element {
  const [ref, isBlinking] = useBlink(props.shouldAnimate)

  const color = () => props.isUnresolved ? undefined : props.isError ? 'error' : 'success'
  const char = () =>
    !props.shouldAnimate || isBlinking() || props.isError || !props.isUnresolved
      ? BLACK_CIRCLE
      : ' '

  return (
    <box ref={ref} minWidth={2}>
      <text fg={color()} dimmed={props.isUnresolved}>{char()}</text>
    </box>
  )
}
