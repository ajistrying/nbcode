import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import figures from 'figures'
import { TEAMMATE_MESSAGE_TAG } from '../../../constants/xml.js'
import { Ansi, type TextProps } from '../../../ink.js'
import { toInkColor } from '../../../utils/ink.js'
import { jsonParse } from '../../../utils/slowOperations.js'
import { isShutdownApproved } from '../../../utils/teammateMailbox.js'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { tryRenderPlanApprovalMessage } from './PlanApprovalMessage.solid.js'
import { tryRenderShutdownMessage } from './ShutdownMessage.solid.js'
import { tryRenderTaskAssignmentMessage } from './TaskAssignmentMessage.solid.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
  isTranscriptMode?: boolean
}

type ParsedMessage = {
  teammateId: string
  content: string
  color?: string
  summary?: string
}

const TEAMMATE_MSG_REGEX = new RegExp(
  `<${TEAMMATE_MESSAGE_TAG}\\s+teammate_id="([^"]+)"(?:\\s+color="([^"]+)")?(?:\\s+summary="([^"]+)")?>\\n?([\\s\\S]*?)\\n?<\\/${TEAMMATE_MESSAGE_TAG}>`,
  'g',
)

function parseTeammateMessages(text: string): ParsedMessage[] {
  const messages: ParsedMessage[] = []
  for (const match of text.matchAll(TEAMMATE_MSG_REGEX)) {
    if (match[1] && match[4]) {
      messages.push({
        teammateId: match[1],
        color: match[2],
        summary: match[3],
        content: match[4].trim(),
      })
    }
  }
  return messages
}

function getDisplayName(teammateId: string): string {
  if (teammateId === 'leader') return 'leader'
  return teammateId
}

export function UserTeammateMessage(props: Props): JSX.Element {
  const messages = () =>
    parseTeammateMessages(props.param.text).filter((msg) => {
      if (isShutdownApproved(msg.content)) return false
      try {
        const parsed = jsonParse(msg.content)
        if (parsed?.type === 'teammate_terminated') return false
      } catch { /* Not JSON */ }
      return true
    })

  if (messages().length === 0) return null

  return (
    <box flexDirection="column" marginTop={props.addMargin ? 1 : 0} width="100%">
      <For each={messages()}>
        {(msg, index) => {
          const inkColor = toInkColor(msg.color)
          const displayName = getDisplayName(msg.teammateId)

          const planApprovalElement = tryRenderPlanApprovalMessage(msg.content, displayName)
          if (planApprovalElement) return <>{planApprovalElement}</>

          const shutdownElement = tryRenderShutdownMessage(msg.content)
          if (shutdownElement) return <>{shutdownElement}</>

          const taskAssignmentElement = tryRenderTaskAssignmentMessage(msg.content)
          if (taskAssignmentElement) return <>{taskAssignmentElement}</>

          let parsedIdleNotification: { type?: string } | null = null
          try { parsedIdleNotification = jsonParse(msg.content) } catch { /* Not JSON */ }

          if (parsedIdleNotification?.type === 'idle_notification') return null

          if (parsedIdleNotification?.type === 'task_completed') {
            const taskCompleted = parsedIdleNotification as { type: string; from: string; taskId: string; taskSubject?: string }
            return (
              <box flexDirection="column" marginTop={1}>
                <text fg={inkColor}>{`@${displayName}${figures.pointer}`}</text>
                <MessageResponse>
                  <text fg="success">{"\u2713"}</text>
                  <text>
                    {' '}Completed task #{taskCompleted.taskId}
                    <Show when={taskCompleted.taskSubject}>
                      <text dimmed> ({taskCompleted.taskSubject})</text>
                    </Show>
                  </text>
                </MessageResponse>
              </box>
            )
          }

          return <TeammateMessageContent displayName={displayName} inkColor={inkColor} content={msg.content} summary={msg.summary} isTranscriptMode={props.isTranscriptMode} />
        }}
      </For>
    </box>
  )
}

type TeammateMessageContentProps = {
  displayName: string
  inkColor: TextProps['color']
  content: string
  summary?: string
  isTranscriptMode?: boolean
}

export function TeammateMessageContent(props: TeammateMessageContentProps): JSX.Element {
  return (
    <box flexDirection="column" marginTop={1}>
      <box>
        <text fg={props.inkColor}>{`@${props.displayName}${figures.pointer}`}</text>
        <Show when={props.summary}>
          <text> {props.summary}</text>
        </Show>
      </box>
      <Show when={props.isTranscriptMode}>
        <box paddingLeft={2}>
          <text><Ansi>{props.content}</Ansi></text>
        </box>
      </Show>
    </box>
  )
}
