import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { onMount } from 'solid-js'
import { Select } from '../../components/CustomSelect/select.js'
import { PermissionDialog } from '../../components/permissions/PermissionDialog.js'

type Props = {
  pluginName: string
  pluginDescription?: string
  marketplaceName: string
  sourceCommand: string
  onResponse: (response: 'yes' | 'no' | 'disable') => void
}

const AUTO_DISMISS_MS = 30_000

export function PluginHintMenu(props: Props): JSX.Element {
  let onResponseRef = props.onResponse

  const updateRef = () => {
    onResponseRef = props.onResponse
  }
  updateRef()

  onMount(() => {
    const timeoutId = setTimeout(
      () => onResponseRef('no'),
      AUTO_DISMISS_MS,
    )
    return () => clearTimeout(timeoutId)
  })

  function onSelect(value: string): void {
    switch (value) {
      case 'yes':
        props.onResponse('yes')
        break
      case 'disable':
        props.onResponse('disable')
        break
      default:
        props.onResponse('no')
    }
  }

  const options = [
    {
      label: (
        <text>
          Yes, install <b>{props.pluginName}</b>
        </text>
      ),
      value: 'yes',
    },
    {
      label: 'No',
      value: 'no',
    },
    {
      label: "No, and don't show plugin installation hints again",
      value: 'disable',
    },
  ]

  return (
    <PermissionDialog title="Plugin Recommendation">
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <box marginBottom={1}>
          <text dimmed>
            The <b>{props.sourceCommand}</b> command suggests installing a
            plugin.
          </text>
        </box>
        <box>
          <text dimmed>Plugin:</text>
          <text> {props.pluginName}</text>
        </box>
        <box>
          <text dimmed>Marketplace:</text>
          <text> {props.marketplaceName}</text>
        </box>
        <Show when={props.pluginDescription}>
          <box>
            <text dimmed>{props.pluginDescription}</text>
          </box>
        </Show>
        <box marginTop={1}>
          <text>Would you like to install it?</text>
        </box>
        <box>
          <Select
            options={options}
            onChange={onSelect}
            onCancel={() => props.onResponse('no')}
          />
        </box>
      </box>
    </PermissionDialog>
  )
}
