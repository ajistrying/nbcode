import type { JSX } from '@opentui/solid'
import { For } from 'solid-js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  errors: Array<{ file: string; error: string }>
  onContinue: () => void
  onExit: () => void
}

export function InvalidConfigDialog(props: Props): JSX.Element {
  function handleSelect(value: string): void {
    if (value === 'exit') {
      props.onExit()
    } else {
      props.onContinue()
    }
  }

  return (
    <Dialog title="Configuration Error" onCancel={props.onExit} color="warning">
      <box flexDirection="column">
        <For each={props.errors}>{(err) => (
          <box flexDirection="column">
            <text><b>{err.file}</b></text>
            <box marginLeft={2}>
              <text dimmed>{err.error}</text>
            </box>
          </box>
        )}</For>
      </box>
      <Select
        options={[
          { label: 'Exit and fix manually', value: 'exit' },
          { label: 'Continue with defaults', value: 'continue' },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
