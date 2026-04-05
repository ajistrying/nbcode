import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { formatNumber } from '../../../utils/format.js'
import type { Theme } from '../../../utils/theme.js'

type Props = {
  agentType: string
  description?: string
  name?: string
  descriptionColor?: keyof Theme
  taskDescription?: string
  toolUseCount: number
  tokens: number | null
  color?: keyof Theme
  isLast: boolean
  isResolved: boolean
  isError: boolean
  isAsync?: boolean
  shouldAnimate: boolean
  lastToolInfo?: string | null
  hideType?: boolean
}

export function AgentProgressLine(props: Props): JSX.Element {
  const isAsync = () => props.isAsync ?? false
  const hideType = () => props.hideType ?? false
  const treeChar = () => props.isLast ? '\u2514\u2500' : '\u251C\u2500'
  const isBackgrounded = () => isAsync() && props.isResolved

  const getStatusText = () => {
    if (!props.isResolved) {
      return props.lastToolInfo || 'Initializing\u2026'
    }
    if (isBackgrounded()) {
      return 'backgrounded'
    }
    return null
  }

  const typeLabel = () => {
    if (hideType()) return ''
    return props.agentType
  }

  return (
    <box flexDirection="row">
      <text dimmed>{treeChar()} </text>
      <Show when={!hideType()}>
        <text dimmed>{typeLabel()} </text>
      </Show>
      <Show when={props.name}>
        <text fg={props.color}><b>{props.name}</b></text>
        <text> </text>
      </Show>
      <Show when={props.description}>
        <text fg={props.descriptionColor ?? props.color}>
          {props.description}
        </text>
      </Show>
      <Show when={props.taskDescription}>
        <text dimmed> {props.taskDescription}</text>
      </Show>
      <Show when={props.toolUseCount > 0 || props.tokens}>
        <text dimmed>
          {' ('}
          <Show when={props.toolUseCount > 0}>
            {props.toolUseCount} tool {props.toolUseCount === 1 ? 'use' : 'uses'}
          </Show>
          <Show when={props.toolUseCount > 0 && props.tokens}>, </Show>
          <Show when={props.tokens}>
            {formatNumber(props.tokens!)} tokens
          </Show>
          {')'}
        </text>
      </Show>
      <Show when={getStatusText()}>
        <text dimmed> {getStatusText()}</text>
      </Show>
    </box>
  )
}
