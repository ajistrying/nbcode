import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { type NetworkHostPattern, shouldAllowManagedSandboxDomainsOnly } from 'src/utils/sandbox/sandbox-adapter.js'
import { Select } from '../../CustomSelect/select.js'
import { PermissionDialog } from './PermissionDialog.solid.js'

export type SandboxPermissionRequestProps = {
  hostPattern: NetworkHostPattern
  onUserResponse: (response: {
    allow: boolean
    persistToSettings: boolean
  }) => void
}

export function SandboxPermissionRequest(props: SandboxPermissionRequestProps): JSX.Element {
  const host = () => props.hostPattern.host

  function onSelect(value: string) {
    switch (value) {
      case 'yes':
        props.onUserResponse({ allow: true, persistToSettings: false })
        break
      case 'yes-dont-ask-again':
        props.onUserResponse({ allow: true, persistToSettings: true })
        break
      case 'no':
        props.onUserResponse({ allow: false, persistToSettings: false })
        break
    }
  }

  const managedDomainsOnly = shouldAllowManagedSandboxDomainsOnly()

  const options = () => [
    { label: 'Yes', value: 'yes' },
    ...(!managedDomainsOnly
      ? [
          {
            label: (
              <text>
                Yes, and don't ask again for <text><b>{host()}</b></text>
              </text>
            ),
            value: 'yes-dont-ask-again',
          },
        ]
      : []),
    {
      label: (
        <text>
          No, and tell Claude what to do differently <text><b>(esc)</b></text>
        </text>
      ),
      value: 'no',
    },
  ]

  return (
    <PermissionDialog title="Network request outside of sandbox">
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <box>
          <text dimmed>Host:</text>
          <text> {host()}</text>
        </box>
        <box marginTop={1}>
          <text>Do you want to allow this connection?</text>
        </box>
        <box>
          <Select
            options={options()}
            onChange={onSelect}
            onCancel={() => {
              props.onUserResponse({ allow: false, persistToSettings: false })
            }}
          />
        </box>
      </box>
    </PermissionDialog>
  )
}
