import type { JSX } from '@opentui/solid'
import { For, Show } from 'solid-js'
import { formatTokens } from '../../../utils/format.js'
import { ContextSuggestions } from './ContextSuggestions.solid.js'
import type { ContextSuggestion } from '../../../utils/contextSuggestions.js'

type ContextItem = {
  name: string
  tokens: number
  type: string
  percentage: number
}

type Props = {
  items: ContextItem[]
  totalTokens: number
  maxTokens: number
  suggestions?: ContextSuggestion[]
  width?: number
}

/**
 * Visualizes the context window usage with a bar chart showing
 * which sources are consuming the most tokens.
 */
export function ContextVisualization(props: Props): JSX.Element {
  const barWidth = () => Math.max((props.width ?? 60) - 30, 10)
  const usagePercent = () =>
    Math.min(100, Math.round((props.totalTokens / props.maxTokens) * 100))

  const usageColor = () => {
    if (usagePercent() >= 95) return 'error'
    if (usagePercent() >= 80) return 'warning'
    return 'success'
  }

  const renderBar = (percentage: number) => {
    const filled = Math.round((percentage / 100) * barWidth())
    const empty = barWidth() - filled
    return '\u2588'.repeat(filled) + '\u2591'.repeat(empty)
  }

  return (
    <box flexDirection="column">
      <box>
        <text>
          <b>Context usage: </b>
        </text>
        <text fg={usageColor()}>
          {formatTokens(props.totalTokens)}/{formatTokens(props.maxTokens)} tokens ({usagePercent()}%)
        </text>
      </box>

      <box marginTop={1}>
        <text fg={usageColor()}>
          {renderBar(usagePercent())}
        </text>
      </box>

      <Show when={props.items.length > 0}>
        <box flexDirection="column" marginTop={1}>
          <text><b>Breakdown:</b></text>
          <For each={props.items}>{(item) => (
            <box>
              <text dimmed>
                {item.name}: {formatTokens(item.tokens)} ({item.percentage}%)
              </text>
            </box>
          )}</For>
        </box>
      </Show>

      <Show when={props.suggestions && props.suggestions.length > 0}>
        <ContextSuggestions suggestions={props.suggestions!} />
      </Show>
    </box>
  )
}
