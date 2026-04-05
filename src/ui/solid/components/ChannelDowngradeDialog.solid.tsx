import type { JSX } from '@opentui/solid'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

export type ChannelDowngradeChoice = 'downgrade' | 'stay' | 'cancel'

type Props = {
  currentVersion: string
  onChoice: (choice: ChannelDowngradeChoice) => void
}

/**
 * Dialog shown when switching from latest to stable channel.
 */
export function ChannelDowngradeDialog(props: Props): JSX.Element {
  function handleSelect(value: ChannelDowngradeChoice): void {
    props.onChoice(value)
  }

  function handleCancel(): void {
    props.onChoice('cancel')
  }

  return (
    <Dialog
      title="Switch to Stable Channel"
      onCancel={handleCancel}
      color="permission"
      hideBorder
      hideInputGuide
    >
      <text>
        The stable channel may have an older version than what you're
        currently running ({props.currentVersion}).
      </text>
      <text dimmed>How would you like to handle this?</text>
      <Select
        options={[
          {
            label: 'Allow possible downgrade to stable version',
            value: 'downgrade' as ChannelDowngradeChoice,
          },
          {
            label: `Stay on current version (${props.currentVersion}) until stable catches up`,
            value: 'stay' as ChannelDowngradeChoice,
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
