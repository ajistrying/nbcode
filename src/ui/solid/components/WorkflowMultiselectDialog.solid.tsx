import { createSignal } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { Workflow } from '../../../commands/install-github-app/types.js'
import type { ExitState } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { SelectMulti } from '../../components/CustomSelect/SelectMulti.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'

type WorkflowOption = {
  value: Workflow
  label: string
}

type Props = {
  onSubmit: (selectedWorkflows: Workflow[]) => void
  defaultSelections: Workflow[]
}

const WORKFLOWS: WorkflowOption[] = [
  {
    value: 'claude' as const,
    label: '@Claude Code - Tag @claude in issues and PR comments',
  },
  {
    value: 'claude-review' as const,
    label: 'Claude Code Review - Automated code review on new PRs',
  },
]

function renderInputGuide(exitState: ExitState): JSX.Element {
  if (exitState.pending) {
    return <text>Press {exitState.keyName} again to exit</text>
  }
  return (
    <Byline>
      <KeyboardShortcutHint shortcut="\u2191\u2193" action="navigate" />
      <KeyboardShortcutHint shortcut="Space" action="toggle" />
      <KeyboardShortcutHint shortcut="Enter" action="confirm" />
      <ConfigurableShortcutHint
        action="confirm:no"
        context="Confirmation"
        fallback="Esc"
        description="cancel"
      />
    </Byline>
  )
}

export function WorkflowMultiselectDialog(props: Props): JSX.Element {
  const [showError, setShowError] = createSignal(false)

  const handleSubmit = (selectedValues: Workflow[]) => {
    if (selectedValues.length === 0) {
      setShowError(true)
      return
    }
    setShowError(false)
    props.onSubmit(selectedValues)
  }

  const handleChange = () => {
    setShowError(false)
  }

  const handleCancel = () => {
    setShowError(true)
  }

  return (
    <Dialog
      title="Select GitHub workflows to install"
      subtitle="We'll create a workflow file in your repository for each one you select."
      onCancel={handleCancel}
      inputGuide={renderInputGuide}
    >
      <box>
        <text dimmed>
          More workflow examples (issue triage, CI fixes, etc.) at:{' '}
          https://github.com/anthropics/claude-code-action/blob/main/examples/
        </text>
      </box>

      <SelectMulti
        options={WORKFLOWS.map(workflow => ({
          label: workflow.label,
          value: workflow.value,
        }))}
        defaultValue={props.defaultSelections}
        onSubmit={handleSubmit}
        onChange={handleChange}
        onCancel={handleCancel}
        hideIndexes={true}
      />

      <Show when={showError()}>
        <box>
          <text fg="red">
            You must select at least one workflow to continue
          </text>
        </box>
      </Show>
    </Dialog>
  )
}
