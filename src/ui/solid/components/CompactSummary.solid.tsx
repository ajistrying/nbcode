import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import type { Screen } from '../../../screens/REPL.js'
import type { NormalizedUserMessage } from '../../../types/message.js'
import { getUserMessageText } from '../../../utils/messages.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.solid.js'
import { MessageResponse } from './MessageResponse.solid.js'

type Props = {
  message: NormalizedUserMessage
  screen: Screen
}

export function CompactSummary(props: Props): JSX.Element {
  const isTranscriptMode = () => props.screen === 'transcript'
  const textContent = () => getUserMessageText(props.message) || ''
  const metadata = () => props.message.summarizeMetadata

  return (
    <Show when={metadata()}>
      <MessageResponse>
        <box flexDirection="column">
          <box>
            <text fg="success">{BLACK_CIRCLE} </text>
            <text dimmed>
              {metadata()!.summary}
            </text>
            <Show when={!isTranscriptMode()}>
              <text dimmed>
                {' '}
                <ConfigurableShortcutHint
                  action="app:toggleTranscript"
                  context="Global"
                  fallback="ctrl+o"
                  description="expand"
                  parens
                />
              </text>
            </Show>
          </box>
        </box>
      </MessageResponse>
    </Show>
  ) as JSX.Element
}
