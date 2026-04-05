import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { stringWidth } from '../../../ink/stringWidth.js'
import type { NormalizedMessage } from '../../../types/message.js'

type Props = {
  message: NormalizedMessage
  isTranscriptMode: boolean
}

export function MessageTimestamp(props: Props): JSX.Element {
  const shouldShowTimestamp = () =>
    props.isTranscriptMode &&
    props.message.timestamp &&
    props.message.type === 'assistant' &&
    props.message.message.content.some(c => c.type === 'text')

  const formattedTimestamp = () =>
    new Date(props.message.timestamp!).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

  return (
    <Show when={shouldShowTimestamp()}>
      <box minWidth={stringWidth(formattedTimestamp())}>
        <text dimmed>{formattedTimestamp()}</text>
      </box>
    </Show>
  ) as JSX.Element
}
