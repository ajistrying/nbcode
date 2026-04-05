import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import { useQueuedMessage } from '../../../context/QueuedMessageContext.js'
import { formatBriefTimestamp } from '../../../utils/formatBriefTimestamp.js'
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from '../../../utils/thinking.js'

type Props = {
  text: string
  useBriefLayout?: boolean
  timestamp?: string
}

export function HighlightedThinkingText(props: Props): JSX.Element {
  const isQueued = () => useQueuedMessage()?.isQueued ?? false
  const pointerColor = () => 'subtle'

  if (props.useBriefLayout) {
    const ts = () => props.timestamp ? formatBriefTimestamp(props.timestamp) : ''
    return (
      <box flexDirection="column" paddingLeft={2}>
        <box flexDirection="row">
          <text fg={isQueued() ? 'subtle' : 'briefLabelYou'}>You</text>
          <Show when={ts()}>
            <text dimmed> {ts()}</text>
          </Show>
        </box>
        <text fg={isQueued() ? 'subtle' : 'text'}>{props.text}</text>
      </box>
    )
  }

  const ultrathinkEnabled = isUltrathinkEnabled()
  const triggerPositions = () => findThinkingTriggerPositions(props.text)

  return (
    <box flexDirection="row" gap={1}>
      <text fg={pointerColor()}>{figures.pointer}</text>
      <Show when={ultrathinkEnabled && triggerPositions().length > 0}
        fallback={<text>{props.text}</text>}>
        <text>
          <For each={(() => {
            const positions = triggerPositions()
            const parts: { text: string; color?: string }[] = []
            let lastIndex = 0
            for (const pos of positions) {
              if (pos.start > lastIndex) {
                parts.push({ text: props.text.slice(lastIndex, pos.start) })
              }
              parts.push({ text: props.text.slice(pos.start, pos.end), color: getRainbowColor(pos.colorIndex) })
              lastIndex = pos.end
            }
            if (lastIndex < props.text.length) {
              parts.push({ text: props.text.slice(lastIndex) })
            }
            return parts
          })()}>
            {(part) => (
              <Show when={part.color} fallback={<>{part.text}</>}>
                <text fg={part.color}>{part.text}</text>
              </Show>
            )}
          </For>
        </text>
      </Show>
    </box>
  )
}
