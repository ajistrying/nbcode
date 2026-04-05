import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import sample from 'lodash-es/sample.js'
import { extractTag } from '../../../utils/messages.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

function getSavingMessage(): string {
  return sample(['Got it.', 'Good to know.', 'Noted.'])!
}

type Props = {
  addMargin: boolean
  text: string
}

export function UserMemoryInputMessage(props: Props): JSX.Element {
  const input = () => extractTag(props.text, 'user-memory-input')

  // Compute once (useMemo(fn, []) -> just a variable computed once at component creation)
  const savingText = getSavingMessage()

  return (
    <Show when={input()}>
      <box flexDirection="column" marginTop={props.addMargin ? 1 : 0} width="100%">
        <box>
          <text fg="remember" bg="memoryBackgroundColor">
            #
          </text>
          <text bg="memoryBackgroundColor" fg="text">
            {' '}
            {input()}{' '}
          </text>
        </box>
        <MessageResponse height={1}>
          <text dimmed>{savingText}</text>
        </MessageResponse>
      </box>
    </Show>
  )
}
