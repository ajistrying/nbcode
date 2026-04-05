import { onMount } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { logEvent } from 'src/services/analytics/index.js'
import { gracefulShutdownSync } from '../../../utils/gracefulShutdown.js'
import { updateSettingsForSource } from '../../../utils/settings/settings.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  onAccept(): void
}

export function BypassPermissionsModeDialog(props: Props): JSX.Element {
  onMount(() => {
    logEvent('tengu_bypass_permissions_mode_dialog_shown', {})
  })

  function onChange(value: 'accept' | 'decline') {
    switch (value) {
      case 'accept': {
        logEvent('tengu_bypass_permissions_mode_dialog_accept', {})
        updateSettingsForSource('userSettings', {
          skipDangerousModePermissionPrompt: true,
        })
        props.onAccept()
        break
      }
      case 'decline': {
        gracefulShutdownSync(1)
        break
      }
    }
  }

  const handleEscape = () => {
    gracefulShutdownSync(0)
  }

  return (
    <Dialog
      title="WARNING: Noble Base Code running in Bypass Permissions mode"
      color="error"
      onCancel={handleEscape}
    >
      <box flexDirection="column" gap={1}>
        <text>
          In Bypass Permissions mode, Noble Base Code will not ask for your approval
          before running potentially dangerous commands.
          {'\n'}
          This mode should only be used in a sandboxed container/VM that has
          restricted internet access and can easily be restored if damaged.
        </text>
        <text>
          By proceeding, you accept all responsibility for actions taken while
          running in Bypass Permissions mode.
        </text>
        <text fg="blue">https://code.claude.com/docs/en/security</text>
      </box>

      <Select
        options={[
          { label: 'No, exit', value: 'decline' },
          { label: 'Yes, I accept', value: 'accept' },
        ]}
        onChange={(value: string) => onChange(value as 'accept' | 'decline')}
      />
    </Dialog>
  )
}
