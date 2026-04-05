import { createMemo, Show, For, type JSXElement } from 'solid-js'
import { useAppState } from '../../../state/AppState.js'
import {
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_NOTIFICATION_TAG,
} from '../../../constants/xml.js'
import { QueuedMessageProvider } from '../../../context/QueuedMessageContext.js'
import { useCommandQueue } from '../../../hooks/useCommandQueue.js'
import type { QueuedCommand } from '../../../types/textInputTypes.js'
import { isQueuedCommandVisible } from '../../../utils/messageQueueManager.js'
import {
  createUserMessage,
  EMPTY_LOOKUPS,
  normalizeMessages,
} from '../../../utils/messages.js'
import { jsonParse } from '../../../utils/slowOperations.js'
import { Message } from '../../solid/messages/Message.js'

const EMPTY_SET = new Set<string>()

function isIdleNotification(value: string): boolean {
  try {
    const parsed = jsonParse(value)
    return parsed?.type === 'idle_notification'
  } catch {
    return false
  }
}

const MAX_VISIBLE_NOTIFICATIONS = 3

function createOverflowNotificationMessage(count: number): string {
  return `<${TASK_NOTIFICATION_TAG}>
<${SUMMARY_TAG}>+${count} more tasks completed</${SUMMARY_TAG}>
<${STATUS_TAG}>completed</${STATUS_TAG}>
</${TASK_NOTIFICATION_TAG}>`
}

function processQueuedCommands(
  queuedCommands: QueuedCommand[],
): QueuedCommand[] {
  const filteredCommands = queuedCommands.filter(
    (cmd) => typeof cmd.value !== 'string' || !isIdleNotification(cmd.value),
  )

  const taskNotifications = filteredCommands.filter(
    (cmd) => cmd.mode === 'task-notification',
  )
  const otherCommands = filteredCommands.filter(
    (cmd) => cmd.mode !== 'task-notification',
  )

  if (taskNotifications.length <= MAX_VISIBLE_NOTIFICATIONS) {
    return [...otherCommands, ...taskNotifications]
  }

  const visibleNotifications = taskNotifications.slice(
    0,
    MAX_VISIBLE_NOTIFICATIONS - 1,
  )
  const overflowCount =
    taskNotifications.length - (MAX_VISIBLE_NOTIFICATIONS - 1)

  const overflowCommand: QueuedCommand = {
    value: createOverflowNotificationMessage(overflowCount),
    mode: 'task-notification',
  }

  return [...otherCommands, ...visibleNotifications, overflowCommand]
}

export function PromptInputQueuedCommands(): JSXElement {
  const queuedCommands = useCommandQueue()
  const viewingAgent = useAppState((s: any) => !!s.viewingAgentTaskId)

  const messages = createMemo(() => {
    if (queuedCommands().length === 0) return null
    const visibleCommands = queuedCommands().filter(isQueuedCommandVisible)
    if (visibleCommands.length === 0) return null
    const processedCommands = processQueuedCommands(visibleCommands)
    return normalizeMessages(
      processedCommands.map((cmd) => {
        let content = cmd.value
        if (cmd.mode === 'bash' && typeof content === 'string') {
          content = `<bash-input>${content}</bash-input>`
        }
        return createUserMessage({ content })
      }),
    )
  })

  return (
    <Show when={!viewingAgent() && messages() !== null}>
      <box marginTop={1} flexDirection="column">
        <For each={messages()!}>
          {(message, i) => (
            <QueuedMessageProvider isFirst={i() === 0} useBriefLayout={false}>
              <Message
                message={message}
                lookups={EMPTY_LOOKUPS}
                addMargin={false}
                tools={[]}
                commands={[]}
                verbose={false}
                inProgressToolUseIDs={EMPTY_SET}
                progressMessagesForMessage={[]}
                shouldAnimate={false}
                shouldShowDot={false}
                isTranscriptMode={false}
                isStatic={true}
              />
            </QueuedMessageProvider>
          )}
        </For>
      </box>
    </Show>
  )
}
