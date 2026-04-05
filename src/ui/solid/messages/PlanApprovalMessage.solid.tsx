import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { Markdown } from '../../../components/Markdown.js'
import { jsonParse } from '../../../utils/slowOperations.js'
import { type IdleNotificationMessage, isIdleNotification, isPlanApprovalRequest, isPlanApprovalResponse, type PlanApprovalRequestMessage, type PlanApprovalResponseMessage } from '../../../utils/teammateMailbox.js'
import { getShutdownMessageSummary } from '../../../components/messages/ShutdownMessage.js'
import { getTaskAssignmentSummary } from '../../../components/messages/TaskAssignmentMessage.js'

type PlanApprovalRequestProps = {
  request: PlanApprovalRequestMessage
}

export function PlanApprovalRequestDisplay(props: PlanApprovalRequestProps): JSX.Element {
  return (
    <box flexDirection="column" marginY={1}>
      <box borderStyle="round" borderColor="planMode" flexDirection="column" paddingX={1}>
        <box marginBottom={1}>
          <text fg="planMode"><b>Plan Approval Request from {props.request.from}</b></text>
        </box>
        <box borderStyle="dashed" borderColor="subtle" borderLeft={false} borderRight={false} flexDirection="column" paddingX={1} marginBottom={1}>
          <Markdown>{props.request.planContent}</Markdown>
        </box>
        <text dimmed>Plan file: {props.request.planFilePath}</text>
      </box>
    </box>
  )
}

type PlanApprovalResponseProps = {
  response: PlanApprovalResponseMessage
  senderName: string
}

export function PlanApprovalResponseDisplay(props: PlanApprovalResponseProps): JSX.Element {
  if (props.response.approved) {
    return (
      <box flexDirection="column" marginY={1}>
        <box borderStyle="round" borderColor="success" flexDirection="column" paddingX={1} paddingY={1}>
          <box><text fg="success"><b>{"\u2713"} Plan Approved by {props.senderName}</b></text></box>
          <box marginTop={1}><text>You can now proceed with implementation. Your plan mode restrictions have been lifted.</text></box>
        </box>
      </box>
    )
  }
  return (
    <box flexDirection="column" marginY={1}>
      <box borderStyle="round" borderColor="error" flexDirection="column" paddingX={1} paddingY={1}>
        <box><text fg="error"><b>{"\u2717"} Plan Rejected by {props.senderName}</b></text></box>
        <Show when={props.response.feedback}>
          <box marginTop={1} borderStyle="dashed" borderColor="subtle" borderLeft={false} borderRight={false} paddingX={1}>
            <text>Feedback: {props.response.feedback}</text>
          </box>
        </Show>
        <box marginTop={1}><text dimmed>Please revise your plan based on the feedback and resubmit for approval.</text></box>
      </box>
    </box>
  )
}

export function tryRenderPlanApprovalMessage(content: string, senderName: string): JSX.Element | null {
  const request = isPlanApprovalRequest(content)
  if (request) {
    return <PlanApprovalRequestDisplay request={request} />
  }
  const response = isPlanApprovalResponse(content)
  if (response) {
    return <PlanApprovalResponseDisplay response={response} senderName={senderName} />
  }
  return null
}
