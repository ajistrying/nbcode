import type { JSX } from '@opentui/solid'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  ideName: string
  onChoice: (choice: 'yes' | 'no') => void
}

export function IdeOnboardingDialog(props: Props): JSX.Element {
  return (
    <Dialog
      title={`Connect to ${props.ideName}?`}
      onCancel={() => props.onChoice('no')}
      color="permission"
    >
      <text>
        Claude Code can connect to {props.ideName} to provide a richer
        development experience, including showing diffs inline in your editor.
      </text>
      <Select
        options={[
          { label: 'Yes, connect', value: 'yes' },
          { label: 'No, not now', value: 'no' },
        ]}
        onChange={(value) => props.onChoice(value as 'yes' | 'no')}
        onCancel={() => props.onChoice('no')}
      />
    </Dialog>
  )
}
