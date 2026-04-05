import type { JSX } from '@opentui/solid'
import { Show, For, Switch, Match } from 'solid-js'
import type { NormalizedMessage } from '../../../types/message.js'
import { MessageRow } from './MessageRow.solid.js'

type Props = {
  message: NormalizedMessage
  messages: NormalizedMessage[]
  messageIndex: number
  isTranscriptMode: boolean
  verbose: boolean
  shouldAnimate: boolean
  addMargin: boolean
  children?: JSX.Element
}

/**
 * Top-level Message component that dispatches to the appropriate
 * sub-message renderer based on message type and content type.
 * This is a structural port — the actual rendering logic for each
 * content block type should be implemented in dedicated sub-components.
 */
export function Message(props: Props): JSX.Element {
  const isLastMessage = () =>
    props.messageIndex === props.messages.length - 1

  return (
    <box flexDirection="column" marginTop={props.addMargin ? 1 : 0}>
      <MessageRow
        message={props.message}
        isTranscriptMode={props.isTranscriptMode}
        verbose={props.verbose}
        shouldAnimate={props.shouldAnimate && isLastMessage()}
      >
        <Switch>
          <Match when={props.message.type === 'user'}>
            {/* User message rendering delegated to sub-components */}
            <box flexDirection="column">
              {props.children}
            </box>
          </Match>
          <Match when={props.message.type === 'assistant'}>
            {/* Assistant message rendering delegated to sub-components */}
            <box flexDirection="column">
              {props.children}
            </box>
          </Match>
        </Switch>
      </MessageRow>
    </box>
  )
}
