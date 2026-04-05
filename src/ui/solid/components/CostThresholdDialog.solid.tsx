import type { JSX } from '@opentui/solid'
import { Link } from '../../../ink.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  onDone: () => void
}

export function CostThresholdDialog(props: Props): JSX.Element {
  return (
    <Dialog
      title="You've spent $5 on the Anthropic API this session."
      onCancel={props.onDone}
    >
      <box flexDirection="column">
        <text>Learn more about how to monitor your spending:</text>
        <Link url="https://code.claude.com/docs/en/costs" />
      </box>
      <Select
        options={[
          {
            value: 'ok',
            label: 'Got it, thanks!',
          },
        ]}
        onChange={props.onDone}
      />
    </Dialog>
  )
}
