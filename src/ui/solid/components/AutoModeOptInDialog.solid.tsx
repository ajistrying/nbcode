import { onMount } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { logEvent } from 'src/services/analytics/index.js'
import { updateSettingsForSource } from '../../../utils/settings/settings.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

export const AUTO_MODE_DESCRIPTION =
  "Auto mode lets Claude handle permission prompts automatically \u2014 Claude checks each tool call for risky actions and prompt injection before executing. Actions Claude identifies as safe are executed, while actions Claude identifies as risky are blocked and Claude may try a different approach. Ideal for long-running tasks. Sessions are slightly more expensive. Claude can make mistakes that allow harmful commands to run, it's recommended to only use in isolated environments. Shift+Tab to change mode."

type Props = {
  onAccept(): void
  onDecline(): void
  declineExits?: boolean
}

export function AutoModeOptInDialog(props: Props): JSX.Element {
  onMount(() => {
    logEvent('tengu_auto_mode_opt_in_dialog_shown', {})
  })

  function onChange(value: 'accept' | 'accept-default' | 'decline') {
    switch (value) {
      case 'accept': {
        logEvent('tengu_auto_mode_opt_in_dialog_accept', {})
        updateSettingsForSource('userSettings', {
          skipAutoPermissionPrompt: true,
        })
        props.onAccept()
        break
      }
      case 'accept-default': {
        logEvent('tengu_auto_mode_opt_in_dialog_accept_default', {})
        updateSettingsForSource('userSettings', {
          skipAutoPermissionPrompt: true,
          permissions: { defaultMode: 'auto' },
        })
        props.onAccept()
        break
      }
      case 'decline': {
        logEvent('tengu_auto_mode_opt_in_dialog_decline', {})
        props.onDecline()
      }
    }
  }

  const declineLabel = () => (props.declineExits ? 'No, exit' : 'No, go back')

  return (
    <Dialog title="Enable auto mode?" color="warning" onCancel={props.onDecline}>
      <box flexDirection="column" gap={1}>
        <text>{AUTO_MODE_DESCRIPTION}</text>
        <text fg="blue">https://code.claude.com/docs/en/security</text>
      </box>

      <Select
        options={[
          ...(true
            ? [
                {
                  label: 'Yes, and make it my default mode',
                  value: 'accept-default' as const,
                },
              ]
            : []),
          { label: 'Yes, enable auto mode', value: 'accept' as const },
          {
            label: declineLabel(),
            value: 'decline' as const,
          },
        ]}
        onChange={(value: string) =>
          onChange(value as 'accept' | 'accept-default' | 'decline')
        }
        onCancel={props.onDecline}
      />
    </Dialog>
  )
}
