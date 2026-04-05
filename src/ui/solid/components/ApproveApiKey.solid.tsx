import type { JSX } from '@opentui/solid'
import { saveGlobalConfig } from '../../../utils/config.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  customApiKeyTruncated: string
  onDone(approved: boolean): void
}

export function ApproveApiKey(props: Props): JSX.Element {
  function onChange(value: 'yes' | 'no') {
    switch (value) {
      case 'yes': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            approved: [
              ...(current.customApiKeyResponses?.approved ?? []),
              props.customApiKeyTruncated,
            ],
          },
        }))
        props.onDone(true)
        break
      }
      case 'no': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            rejected: [
              ...(current.customApiKeyResponses?.rejected ?? []),
              props.customApiKeyTruncated,
            ],
          },
        }))
        props.onDone(false)
        break
      }
    }
  }

  return (
    <Dialog
      title="Detected a custom API key in your environment"
      color="warning"
      onCancel={() => onChange('no')}
    >
      <text>
        <text><b>ANTHROPIC_API_KEY</b></text>
        <text>: sk-ant-...{props.customApiKeyTruncated}</text>
      </text>
      <text>Do you want to use this API key?</text>
      <Select
        defaultValue="no"
        defaultFocusValue="no"
        options={[
          { label: 'Yes', value: 'yes' },
          {
            label: (
              <text>
                No (<text><b>recommended</b></text>)
              </text>
            ),
            value: 'no',
          },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  )
}
