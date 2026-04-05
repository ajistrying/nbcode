import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getAgentName, getTeammateColor, getTeamName } from '../../../utils/teammate.js'
import { Spinner } from '../../Spinner.js'
import { WorkerBadge } from './WorkerBadge.solid.js'

type Props = {
  toolName: string
  description: string
}

/**
 * Visual indicator shown on workers while waiting for leader to approve a permission request.
 * Displays the pending tool with a spinner and information about what's being requested.
 */
export function WorkerPendingPermission(props: Props): JSX.Element {
  const teamName = getTeamName()
  const agentName = getAgentName()
  const agentColor = getTeammateColor()

  return (
    <box
      flexDirection="column"
      borderStyle="round"
      borderColor="warning"
      paddingX={1}
    >
      <box marginBottom={1}>
        <Spinner />
        <text fg="warning">
          <b>{' '}Waiting for team lead approval</b>
        </text>
      </box>

      <Show when={agentName && agentColor}>
        <box marginBottom={1}>
          <WorkerBadge name={agentName!} color={agentColor!} />
        </box>
      </Show>

      <box>
        <text dimmed>Tool: </text>
        <text>{props.toolName}</text>
      </box>

      <box>
        <text dimmed>Action: </text>
        <text>{props.description}</text>
      </box>

      <Show when={teamName}>
        <box marginTop={1}>
          <text dimmed>
            Permission request sent to team {'"'}
            {teamName}
            {'"'} leader
          </text>
        </box>
      </Show>
    </box>
  )
}
