import type { JSX } from '@opentui/solid'
import type { ValidationError } from '../../../utils/settings/validation.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { ValidationErrorsList } from './ValidationErrorsList.solid.js'

type Props = {
  settingsErrors: ValidationError[]
  onContinue: () => void
  onExit: () => void
}

/**
 * Dialog shown when settings files have validation errors.
 */
export function InvalidSettingsDialog(props: Props): JSX.Element {
  function handleSelect(value: string): void {
    if (value === 'exit') {
      props.onExit()
    } else {
      props.onContinue()
    }
  }

  return (
    <Dialog title="Settings Error" onCancel={props.onExit} color="warning">
      <ValidationErrorsList errors={props.settingsErrors} />
      <text dimmed>
        Files with errors are skipped entirely, not just the invalid settings.
      </text>
      <Select
        options={[
          { label: 'Exit and fix manually', value: 'exit' },
          {
            label: 'Continue without these settings',
            value: 'continue',
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
