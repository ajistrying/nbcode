import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import type { NormalizedMessage } from '../../../types/message.js'
import { MessageModel } from './MessageModel.solid.js'
import { MessageTimestamp } from './MessageTimestamp.solid.js'

type Props = {
  message: NormalizedMessage
  isTranscriptMode: boolean
  verbose: boolean
  shouldAnimate: boolean
  children: JSX.Element
}

/**
 * MessageRow wraps an individual message with optional metadata display
 * (model name, timestamp) in transcript mode.
 */
export function MessageRow(props: Props): JSX.Element {
  return (
    <box flexDirection="column">
      <Show when={props.isTranscriptMode}>
        <box flexDirection="row" gap={1}>
          <MessageTimestamp
            message={props.message}
            isTranscriptMode={props.isTranscriptMode}
          />
          <MessageModel
            message={props.message}
            isTranscriptMode={props.isTranscriptMode}
          />
        </box>
      </Show>
      {props.children}
    </box>
  )
}
