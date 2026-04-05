import { Show, For, createMemo } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import { basename, sep } from 'path'
import type { Attachment } from 'src/utils/attachments.js'
import type { NullRenderingAttachmentType } from '../../../components/messages/nullRenderingAttachments.js'
import { useAppState } from '../../../state/AppState.js'
import { getDisplayPath } from 'src/utils/file.js'
import { formatFileSize } from 'src/utils/format.js'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { UserTextMessage } from './UserTextMessage.solid.js'
import { DiagnosticsDisplay } from '../../../components/DiagnosticsDisplay.js'
import { getContentText } from 'src/utils/messages.js'
import { UserImageMessage } from './UserImageMessage.solid.js'
import { toInkColor } from '../../../utils/ink.js'
import { jsonParse } from '../../../utils/slowOperations.js'
import { plural } from '../../../utils/stringUtils.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { tryRenderPlanApprovalMessage, formatTeammateMessageContent } from './PlanApprovalMessage.solid.js'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { TeammateMessageContent } from './UserTeammateMessage.solid.js'
import { isShutdownApproved } from '../../../utils/teammateMailbox.js'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { FilePathLink } from '../../../components/FilePathLink.js'

type Props = {
  addMargin: boolean
  attachment: Attachment
  verbose: boolean
  isTranscriptMode?: boolean
}

export function AttachmentMessage(props: Props): JSX.Element {
  const isDemoEnv = feature('EXPERIMENTAL_SKILL_SEARCH')
    ? createMemo(() => isEnvTruthy(process.env.IS_DEMO))
    : () => false

  // Handle teammate_mailbox BEFORE switch
  if (isAgentSwarmsEnabled() && props.attachment.type === 'teammate_mailbox') {
    const visibleMessages = () =>
      props.attachment.type === 'teammate_mailbox'
        ? (props.attachment as Extract<Attachment, { type: 'teammate_mailbox' }>).messages.filter(
            (msg) => {
              if (isShutdownApproved(msg.text)) return false
              try {
                const parsed = jsonParse(msg.text)
                return (
                  parsed?.type !== 'idle_notification' &&
                  parsed?.type !== 'teammate_terminated'
                )
              } catch {
                return true
              }
            },
          )
        : []

    if (visibleMessages().length === 0) return null

    return (
      <box flexDirection="column">
        <For each={visibleMessages()}>
          {(msg, idx) => {
            let parsedMsg: {
              type?: string
              taskId?: string
              subject?: string
              assignedBy?: string
            } | null = null
            try {
              parsedMsg = jsonParse(msg.text)
            } catch {
              // Not JSON
            }

            if (parsedMsg?.type === 'task_assignment') {
              return (
                <box paddingLeft={2}>
                  <text>{BLACK_CIRCLE} </text>
                  <text>Task assigned: </text>
                  <text><b>#{parsedMsg.taskId}</b></text>
                  <text> - {parsedMsg.subject}</text>
                  <text dimmed> (from {parsedMsg.assignedBy || msg.from})</text>
                </box>
              )
            }

            const planApprovalElement = tryRenderPlanApprovalMessage(msg.text, msg.from)
            if (planApprovalElement) return <>{planApprovalElement}</>

            const inkColor = toInkColor(msg.color)
            const formattedContent =
              formatTeammateMessageContent(msg.text) ?? msg.text
            return (
              <TeammateMessageContent
                displayName={msg.from}
                inkColor={inkColor}
                content={formattedContent}
                summary={msg.summary}
                isTranscriptMode={props.isTranscriptMode}
              />
            )
          }}
        </For>
      </box>
    )
  }

  // skill_discovery
  if (feature('EXPERIMENTAL_SKILL_SEARCH')) {
    if (props.attachment.type === 'skill_discovery') {
      const att = props.attachment as Extract<Attachment, { type: 'skill_discovery' }>
      if (att.skills.length === 0) return null
      const names = att.skills
        .map((s) => (s.shortId ? `${s.name} [${s.shortId}]` : s.name))
        .join(', ')
      const firstId = att.skills[0]?.shortId
      const hint =
        'external' === 'ant' && !isDemoEnv() && firstId
          ? ` · /skill-feedback ${firstId} 1=wrong 2=noisy 3=good [comment]`
          : ''
      return (
        <Line>
          <text><b>{att.skills.length}</b></text> relevant{' '}
          {plural(att.skills.length, 'skill')}: {names}
          <Show when={hint}>
            <text dimmed>{hint}</text>
          </Show>
        </Line>
      )
    }
  }

  const attachment = props.attachment

  switch (attachment.type) {
    case 'directory':
      return (
        <Line>
          Listed directory <text><b>{attachment.displayPath + sep}</b></text>
        </Line>
      )
    case 'file':
    case 'already_read_file':
      if (attachment.content.type === 'notebook') {
        return (
          <Line>
            Read <text><b>{attachment.displayPath}</b></text> ({attachment.content.file.cells.length}{' '}
            cells)
          </Line>
        )
      }
      if (attachment.content.type === 'file_unchanged') {
        return (
          <Line>
            Read <text><b>{attachment.displayPath}</b></text> (unchanged)
          </Line>
        )
      }
      return (
        <Line>
          Read <text><b>{attachment.displayPath}</b></text> (
          {attachment.content.type === 'text'
            ? `${attachment.content.file.numLines}${attachment.truncated ? '+' : ''} lines`
            : formatFileSize(attachment.content.file.originalSize)}
          )
        </Line>
      )
    case 'compact_file_reference':
      return (
        <Line>
          Referenced file <text><b>{attachment.displayPath}</b></text>
        </Line>
      )
    case 'pdf_reference':
      return (
        <Line>
          Referenced PDF <text><b>{attachment.displayPath}</b></text> ({attachment.pageCount} pages)
        </Line>
      )
    case 'selected_lines_in_ide':
      return (
        <Line>
          Selected{' '}
          <text><b>{attachment.lineEnd - attachment.lineStart + 1}</b></text>{' '}
          lines from <text><b>{attachment.displayPath}</b></text> in{' '}
          {attachment.ideName}
        </Line>
      )
    case 'nested_memory':
      return (
        <Line>
          Loaded <text><b>{attachment.displayPath}</b></text>
        </Line>
      )
    case 'relevant_memories':
      return (
        <box flexDirection="column" marginTop={props.addMargin ? 1 : 0}>
          <box flexDirection="row">
            <box minWidth={2} />
            <text dimmed>
              Recalled <text><b>{attachment.memories.length}</b></text>{' '}
              {attachment.memories.length === 1 ? 'memory' : 'memories'}
              <Show when={!props.isTranscriptMode}>
                {' '}
                <CtrlOToExpand />
              </Show>
            </text>
          </box>
          <Show when={props.verbose || props.isTranscriptMode}>
            <For each={attachment.memories}>
              {(m) => (
                <box flexDirection="column">
                  <MessageResponse>
                    <text dimmed>
                      <FilePathLink filePath={m.path}>{basename(m.path)}</FilePathLink>
                    </text>
                  </MessageResponse>
                  <Show when={props.isTranscriptMode}>
                    <box paddingLeft={5}>
                      <text>{m.content}</text>
                    </box>
                  </Show>
                </box>
              )}
            </For>
          </Show>
        </box>
      )
    case 'dynamic_skill': {
      const skillCount = attachment.skillNames.length
      return (
        <Line>
          Loaded{' '}
          <text>
            <b>
              {skillCount} {plural(skillCount, 'skill')}
            </b>
          </text>{' '}
          from <text><b>{attachment.displayPath}</b></text>
        </Line>
      )
    }
    case 'skill_listing':
      if (attachment.isInitial) return null
      return (
        <Line>
          <text><b>{attachment.skillCount}</b></text>{' '}
          {plural(attachment.skillCount, 'skill')} available
        </Line>
      )
    case 'agent_listing_delta':
      if (attachment.isInitial || attachment.addedTypes.length === 0) return null
      return (
        <Line>
          <text><b>{attachment.addedTypes.length}</b></text> agent{' '}
          {plural(attachment.addedTypes.length, 'type')} available
        </Line>
      )
    case 'queued_command': {
      const text =
        typeof attachment.prompt === 'string'
          ? attachment.prompt
          : getContentText(attachment.prompt) || ''
      const hasImages = attachment.imagePasteIds && attachment.imagePasteIds.length > 0
      return (
        <box flexDirection="column">
          <UserTextMessage
            addMargin={props.addMargin}
            param={{ text, type: 'text' }}
            verbose={props.verbose}
            isTranscriptMode={props.isTranscriptMode}
          />
          <Show when={hasImages}>
            <For each={attachment.imagePasteIds}>
              {(id) => <UserImageMessage imageId={id} />}
            </For>
          </Show>
        </box>
      )
    }
    case 'plan_file_reference':
      return (
        <Line>
          Plan file referenced ({getDisplayPath(attachment.planFilePath)})
        </Line>
      )
    case 'invoked_skills':
      if (attachment.skills.length === 0) return null
      return (
        <Line>
          Skills restored ({attachment.skills.map((s) => s.name).join(', ')})
        </Line>
      )
    case 'diagnostics':
      return <DiagnosticsDisplay attachment={attachment} verbose={props.verbose} />
    case 'mcp_resource':
      return (
        <Line>
          Read MCP resource <text><b>{attachment.name}</b></text> from {attachment.server}
        </Line>
      )
    case 'command_permissions':
      return null
    case 'async_hook_response':
      if (attachment.hookEvent === 'SessionStart' && !props.verbose) return null
      if (!props.verbose && !props.isTranscriptMode) return null
      return (
        <Line>
          Async hook <text><b>{attachment.hookEvent}</b></text> completed
        </Line>
      )
    case 'hook_blocking_error': {
      if (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') return null
      const stderr = attachment.blockingError.blockingError.trim()
      return (
        <>
          <Line fg="error">{attachment.hookName} hook returned blocking error</Line>
          <Show when={stderr}>
            <Line fg="error">{stderr}</Line>
          </Show>
        </>
      )
    }
    case 'hook_non_blocking_error':
      if (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') return null
      return <Line fg="error">{attachment.hookName} hook error</Line>
    case 'hook_error_during_execution':
      if (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') return null
      return <Line>{attachment.hookName} hook warning</Line>
    case 'hook_success':
      return null
    case 'hook_stopped_continuation':
      if (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') return null
      return (
        <Line fg="warning">
          {attachment.hookName} hook stopped continuation: {attachment.message}
        </Line>
      )
    case 'hook_system_message':
      return (
        <Line>
          {attachment.hookName} says: {attachment.content}
        </Line>
      )
    case 'hook_permission_decision': {
      const action = attachment.decision === 'allow' ? 'Allowed' : 'Denied'
      return (
        <Line>
          {action} by <text><b>{attachment.hookEvent}</b></text> hook
        </Line>
      )
    }
    case 'task_status':
      return <text dimmed>{BLACK_CIRCLE} Task status: {attachment.status}</text>
    case 'teammate_shutdown_batch':
      return (
        <box flexDirection="row" width="100%" marginTop={1}>
          <text dimmed>{BLACK_CIRCLE} </text>
          <text dimmed>
            {attachment.count} {plural(attachment.count, 'teammate')} shut down gracefully
          </text>
        </box>
      )
    default:
      return null
  }
}

// Helper component matching the React Line component
function Line(props: { children?: JSX.Element; fg?: string; dimmed?: boolean }): JSX.Element {
  return (
    <MessageResponse>
      <text fg={props.fg} dimmed={props.dimmed ?? true} wrap="wrap">
        {props.children}
      </text>
    </MessageResponse>
  )
}
