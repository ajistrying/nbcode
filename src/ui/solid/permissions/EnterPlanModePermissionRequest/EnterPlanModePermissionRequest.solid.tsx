import type { JSX } from '@opentui/solid'
import { handlePlanModeTransition } from '../../../../bootstrap/state.js'
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../../../services/analytics/index.js'
import { useAppState } from '../../../../state/AppState.js'
import { isPlanModeInterviewPhaseEnabled } from '../../../../utils/planModeV2.js'
import { Select } from '../../../CustomSelect/index.js'
import { PermissionDialog } from '../PermissionDialog.solid.js'
import type { PermissionRequestProps } from '../PermissionRequest.solid.js'

export function EnterPlanModePermissionRequest(props: PermissionRequestProps): JSX.Element {
  const toolPermissionContextMode = useAppState(
    (s: any) => s.toolPermissionContext.mode,
  )

  function handleResponse(value: 'yes' | 'no'): void {
    if (value === 'yes') {
      logEvent('tengu_plan_enter', {
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        entryMethod:
          'tool' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      handlePlanModeTransition(toolPermissionContextMode, 'plan')
      props.onDone()
      props.toolUseConfirm.onAllow({}, [
        { type: 'setMode', mode: 'plan', destination: 'session' },
      ])
    } else {
      props.onDone()
      props.onReject()
      props.toolUseConfirm.onReject()
    }
  }

  const options = [
    { label: 'Yes, enter plan mode', value: 'yes' as const },
    { label: 'No, start implementing now', value: 'no' as const },
  ]

  return (
    <PermissionDialog
      color="planMode"
      title="Enter plan mode?"
      workerBadge={props.workerBadge}
    >
      <box flexDirection="column" marginTop={1} paddingX={1}>
        <text>
          Claude wants to enter plan mode to explore and design an
          implementation approach.
        </text>

        <box marginTop={1} flexDirection="column">
          <text dimmed>In plan mode, Claude will:</text>
          <text dimmed> {'\xB7'} Explore the codebase thoroughly</text>
          <text dimmed> {'\xB7'} Identify existing patterns</text>
          <text dimmed> {'\xB7'} Design an implementation strategy</text>
          <text dimmed> {'\xB7'} Present a plan for your approval</text>
        </box>

        <box marginTop={1}>
          <text dimmed>
            No code changes will be made until you approve the plan.
          </text>
        </box>

        <box marginTop={1}>
          <Select
            options={options}
            onChange={handleResponse}
            onCancel={() => handleResponse('no')}
          />
        </box>
      </box>
    </PermissionDialog>
  )
}
