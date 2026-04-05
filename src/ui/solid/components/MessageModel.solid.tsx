import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { stringWidth } from '../../../ink/stringWidth.js'
import type { NormalizedMessage } from '../../../types/message.js'

type Props = {
  message: NormalizedMessage
  isTranscriptMode: boolean
}

export function MessageModel(props: Props): JSX.Element {
  const shouldShowModel = () =>
    props.isTranscriptMode &&
    props.message.type === 'assistant' &&
    props.message.message.model &&
    props.message.message.content.some(c => c.type === 'text')

  return (
    <Show when={shouldShowModel()}>
      <box minWidth={stringWidth(props.message.message.model!) + 8}>
        <text dimmed>{props.message.message.model}</text>
      </box>
    </Show>
  ) as JSX.Element
}
