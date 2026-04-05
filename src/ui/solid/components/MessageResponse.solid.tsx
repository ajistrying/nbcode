import type { JSX } from '@opentui/solid'
import { createContext, useContext, Show } from 'solid-js'
import { Ratchet } from '../../components/design-system/Ratchet.js'

type Props = {
  children: JSX.Element
  height?: number
}

// This is a context that is used to determine if the message response
// is rendered as a descendant of another MessageResponse. We use it
// to avoid rendering nested ⎿ characters.
const MessageResponseContext = createContext(false)

function MessageResponseProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <MessageResponseContext.Provider value={true}>
      {props.children}
    </MessageResponseContext.Provider>
  )
}

export function MessageResponse(props: Props): JSX.Element {
  const isMessageResponse = useContext(MessageResponseContext)

  if (isMessageResponse) {
    return props.children as JSX.Element
  }

  const content = (
    <MessageResponseProvider>
      <box flexDirection="row" height={props.height} overflowY="hidden">
        <box flexShrink={0}>
          <text dimmed>{'  '}⎿  </text>
        </box>
        <box flexShrink={1} flexGrow={1}>
          {props.children}
        </box>
      </box>
    </MessageResponseProvider>
  )

  return (
    <Show when={props.height === undefined} fallback={content}>
      <Ratchet lock="offscreen">{content}</Ratchet>
    </Show>
  ) as JSX.Element
}
