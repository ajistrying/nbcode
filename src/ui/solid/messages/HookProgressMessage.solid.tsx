import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { HookEvent } from '../../../entrypoints/agentSdkTypes.js'
import type { buildMessageLookups } from '../../../utils/messages.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

type Props = {
  hookEvent: HookEvent
  lookups: ReturnType<typeof buildMessageLookups>
  toolUseID: string
  verbose: boolean
  isTranscriptMode?: boolean
}

export function HookProgressMessage(props: Props): JSX.Element {
  const inProgressHookCount = () =>
    props.lookups.inProgressHookCounts.get(props.toolUseID)?.get(props.hookEvent) ?? 0
  const resolvedHookCount = () =>
    props.lookups.resolvedHookCounts.get(props.toolUseID)?.get(props.hookEvent) ?? 0

  if (inProgressHookCount() === 0) {
    return null
  }

  if (props.hookEvent === 'PreToolUse' || props.hookEvent === 'PostToolUse') {
    if (props.isTranscriptMode) {
      return (
        <MessageResponse>
          <box flexDirection="row">
            <text dimmed>{inProgressHookCount()} </text>
            <text dimmed><b>{props.hookEvent}</b></text>
            <text dimmed>{inProgressHookCount() === 1 ? ' hook' : ' hooks'} ran</text>
          </box>
        </MessageResponse>
      )
    }
    return null
  }

  if (resolvedHookCount() === inProgressHookCount()) {
    return null
  }

  return (
    <MessageResponse>
      <box flexDirection="row">
        <text dimmed>Running </text>
        <text dimmed><b>{props.hookEvent}</b></text>
        <text dimmed>{inProgressHookCount() === 1 ? ' hook\u2026' : ' hooks\u2026'}</text>
      </box>
    </MessageResponse>
  )
}
