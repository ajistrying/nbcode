import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { isShutdownApproved, isShutdownRejected, isShutdownRequest, type ShutdownRejectedMessage, type ShutdownRequestMessage } from '../../../utils/teammateMailbox.js'

type ShutdownRequestProps = { request: ShutdownRequestMessage }

export function ShutdownRequestDisplay(props: ShutdownRequestProps): JSX.Element {
  return (
    <box flexDirection="column" marginY={1}>
      <box borderStyle="round" borderColor="warning" flexDirection="column" paddingX={1} paddingY={1}>
        <box marginBottom={1}>
          <text fg="warning"><b>Shutdown request from {props.request.from}</b></text>
        </box>
        <Show when={props.request.reason}>
          <box><text>Reason: {props.request.reason}</text></box>
        </Show>
      </box>
    </box>
  )
}

type ShutdownRejectedProps = { response: ShutdownRejectedMessage }

export function ShutdownRejectedDisplay(props: ShutdownRejectedProps): JSX.Element {
  return (
    <box flexDirection="column" marginY={1}>
      <box borderStyle="round" borderColor="subtle" flexDirection="column" paddingX={1} paddingY={1}>
        <text fg="subtle"><b>Shutdown rejected by {props.response.from}</b></text>
        <box marginTop={1} borderStyle="dashed" borderColor="subtle" borderLeft={false} borderRight={false} paddingX={1}>
          <text>Reason: {props.response.reason}</text>
        </box>
        <box marginTop={1}>
          <text dimmed>Teammate is continuing to work. You may request shutdown again later.</text>
        </box>
      </box>
    </box>
  )
}

export function tryRenderShutdownMessage(content: string): JSX.Element | null {
  const request = isShutdownRequest(content)
  if (request) {
    return <ShutdownRequestDisplay request={request} />
  }
  if (isShutdownApproved(content)) {
    return null
  }
  const rejected = isShutdownRejected(content)
  if (rejected) {
    return <ShutdownRejectedDisplay response={rejected} />
  }
  return null
}

export function getShutdownMessageSummary(content: string): string | null {
  const request = isShutdownRequest(content)
  if (request) {
    return `[Shutdown Request from ${request.from}]${request.reason ? ` ${request.reason}` : ''}`
  }
  const approved = isShutdownApproved(content)
  if (approved) {
    return `[Shutdown Approved] ${approved.from} is now exiting`
  }
  const rejected = isShutdownRejected(content)
  if (rejected) {
    return `[Shutdown Rejected] ${rejected.from}: ${rejected.reason}`
  }
  return null
}
