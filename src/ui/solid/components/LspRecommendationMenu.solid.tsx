import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { onMount } from 'solid-js'
import { Select } from '../../components/CustomSelect/select.js'
import { PermissionDialog } from '../../components/permissions/PermissionDialog.js'

type Props = {
  pluginName: string
  pluginDescription?: string
  fileExtension: string
  onResponse: (response: 'yes' | 'no' | 'never' | 'disable') => void
}

const AUTO_DISMISS_MS = 30_000

export function LspRecommendationMenu(props: Props): JSX.Element {
  let onResponseRef = props.onResponse

  // Keep ref current
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
      case 'no':
        props.onResponse('no')
        break
      case 'never':
        props.onResponse('never')
        break
      case 'disable':
        props.onResponse('disable')
        break
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
      label: 'No, not now',
      value: 'no',
    },
    {
      label: (
        <text>
          Never for <b>{props.pluginName}</b>
        </text>
      ),
      value: 'never',
    },
    {
      label: 'Disable all LSP recommendations',
      value: 'disable',
    },
  ]

  return (
    <PermissionDialog title="LSP Plugin Recommendation">
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <box marginBottom={1}>
          <text dimmed>
            LSP provides code intelligence like go-to-definition and error
            checking
          </text>
        </box>
        <box>
          <text dimmed>Plugin:</text>
          <text> {props.pluginName}</text>
        </box>
        <Show when={props.pluginDescription}>
          <box>
            <text dimmed>{props.pluginDescription}</text>
          </box>
        </Show>
        <box>
          <text dimmed>Triggered by:</text>
          <text> {props.fileExtension} files</text>
        </box>
        <box marginTop={1}>
          <text>Would you like to install this LSP plugin?</text>
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
