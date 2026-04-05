import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { isTaskAssignment, type TaskAssignmentMessage } from '../../../utils/teammateMailbox.js'

type Props = { assignment: TaskAssignmentMessage }

export function TaskAssignmentDisplay(props: Props): JSX.Element {
  return (
    <box flexDirection="column" marginY={1}>
      <box borderStyle="round" borderColor="cyan_FOR_SUBAGENTS_ONLY" flexDirection="column" paddingX={1} paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan_FOR_SUBAGENTS_ONLY"><b>Task #{props.assignment.taskId} assigned by {props.assignment.assignedBy}</b></text>
        </box>
        <box><text><b>{props.assignment.subject}</b></text></box>
        <Show when={props.assignment.description}>
          <box marginTop={1}><text dimmed>{props.assignment.description}</text></box>
        </Show>
      </box>
    </box>
  )
}

export function tryRenderTaskAssignmentMessage(content: string): JSX.Element | null {
  const assignment = isTaskAssignment(content)
  if (assignment) {
    return <TaskAssignmentDisplay assignment={assignment} />
  }
  return null
}

export function getTaskAssignmentSummary(content: string): string | null {
  const assignment = isTaskAssignment(content)
  if (assignment) {
    return `[Task Assigned] #${assignment.taskId} - ${assignment.subject}`
  }
  return null
}
