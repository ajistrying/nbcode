import { createSignal, createEffect, Show, type JSXElement } from 'solid-js'
import type { UUID } from 'crypto'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getAllBaseTools } from '../../../tools.js'
import type { LogOption } from '../../../types/logs.js'
import { formatRelativeTimeAgo } from '../../../utils/format.js'
import {
  getSessionIdFromLog,
  isLiteLog,
  loadFullLog,
} from '../../../utils/sessionStorage.js'
import { ConfigurableShortcutHint } from '../design-system/ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { LoadingState } from '../design-system/LoadingState.js'
import { Messages } from '../messages/Messages.js'

type Props = {
  log: LogOption
  onExit: () => void
  onSelect: (log: LogOption) => void
}

export function SessionPreview(props: Props): JSXElement {
  const [fullLog, setFullLog] = createSignal<LogOption | null>(null)

  createEffect(() => {
    setFullLog(null)
    if (isLiteLog(props.log)) {
      void loadFullLog(props.log).then(setFullLog)
    }
  })

  const isLoading = () => isLiteLog(props.log) && fullLog() === null
  const displayLog = () => fullLog() ?? props.log
  const conversationId = () =>
    getSessionIdFromLog(displayLog()) || ('' as UUID)

  const tools = getAllBaseTools()

  useKeybinding('confirm:no', props.onExit, { context: 'Confirmation' })

  const handleSelect = () => {
    props.onSelect(fullLog() ?? props.log)
  }

  useKeybinding('confirm:yes', handleSelect, { context: 'Confirmation' })

  return (
    <Show
      when={!isLoading()}
      fallback={
        <box flexDirection="column" padding={1}>
          <LoadingState message="Loading session…" />
          <text dimmed>
            <Byline>
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </text>
        </box>
      }
    >
      <box flexDirection="column">
        <Messages
          messages={displayLog().messages}
          tools={tools}
          commands={[]}
          verbose={true}
          toolJSX={null}
          toolUseConfirmQueue={[]}
          inProgressToolUseIDs={new Set()}
          isMessageSelectorVisible={false}
          conversationId={conversationId()}
          screen="transcript"
          streamingToolUses={[]}
          showAllInTranscript={true}
          isLoading={false}
        />
        <box
          flexShrink={0}
          flexDirection="column"
          borderTopDimColor
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderStyle="single"
          paddingLeft={2}
        >
          <text>
            {formatRelativeTimeAgo(displayLog().modified)} ·{' '}
            {displayLog().messageCount} messages
            {displayLog().gitBranch
              ? ` · ${displayLog().gitBranch}`
              : ''}
          </text>
          <text dimmed>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="resume" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </text>
        </box>
      </box>
    </Show>
  )
}
