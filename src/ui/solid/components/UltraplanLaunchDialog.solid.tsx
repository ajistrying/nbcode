import type { JSX } from '@opentui/solid'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { CCR_TERMS_URL } from '../../../commands/ultraplan.js'

type UltraplanLaunchChoice = 'launch' | 'cancel'

type Props = {
  onChoice: (
    choice: UltraplanLaunchChoice,
    opts?: { disconnectedBridge?: boolean },
  ) => void
}

export function UltraplanLaunchDialog(props: Props): JSX.Element {
  return (
    <Dialog
      title="Launch ultraplan?"
      onCancel={() => props.onChoice('cancel')}
    >
      <box flexDirection="column" gap={1}>
        <text>
          This will start a remote Claude Code session on the web to draft an
          advanced plan using Opus. The plan typically takes 10–30 minutes.
          Your terminal stays free while it works.
        </text>
        <text dimmed>Terms: {CCR_TERMS_URL}</text>
      </box>
      <Select
        options={[
          {
            value: 'launch' as const,
            label: 'Launch ultraplan',
          },
          {
            value: 'cancel' as const,
            label: 'Cancel',
          },
        ]}
        onChange={(value: UltraplanLaunchChoice) => props.onChoice(value)}
      />
    </Dialog>
  )
}
