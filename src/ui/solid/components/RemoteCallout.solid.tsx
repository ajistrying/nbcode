import { onMount, type JSX } from 'solid-js'
import { isBridgeEnabled } from '../../../bridge/bridgeEnabled.js'
import { getClaudeAIOAuthTokens } from '../../../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import type { OptionWithDescription } from '../../components/CustomSelect/select.js'
import { Select } from '../../components/CustomSelect/select.js'
import { PermissionDialog } from '../permissions/PermissionDialog.solid.js'

type RemoteCalloutSelection = 'enable' | 'dismiss'

type Props = {
  onDone: (selection: RemoteCalloutSelection) => void
}

export function RemoteCallout(props: Props): JSX.Element {
  // Latest-ref pattern
  let onDoneRef = props.onDone

  const handleCancel = (): void => {
    onDoneRef('dismiss')
  }

  // Permanently mark as seen on mount so it only shows once
  onMount(() => {
    saveGlobalConfig(current => {
      if (current.remoteDialogSeen) return current
      return {
        ...current,
        remoteDialogSeen: true,
      }
    })
  })

  const handleSelect = (value: RemoteCalloutSelection): void => {
    onDoneRef(value)
  }

  const options: OptionWithDescription<RemoteCalloutSelection>[] = [
    {
      label: 'Enable Remote Control for this session',
      description: 'Opens a secure connection to claude.ai.',
      value: 'enable',
    },
    {
      label: 'Never mind',
      description: 'You can always enable it later with /remote-control.',
      value: 'dismiss',
    },
  ]

  return (
    <PermissionDialog title="Remote Control">
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <box marginBottom={1} flexDirection="column">
          <text>
            Remote Control lets you access this CLI session from the web
            (claude.ai/code) or the Claude app, so you can pick up where you
            left off on any device.
          </text>
          <text> </text>
          <text>
            You can disconnect remote access anytime by running /remote-control
            again.
          </text>
        </box>
        <box>
          <Select options={options} onChange={handleSelect} onCancel={handleCancel} />
        </box>
      </box>
    </PermissionDialog>
  )
}

/**
 * Check whether to show the remote callout (first-time dialog).
 */
export function shouldShowRemoteCallout(): boolean {
  const config = getGlobalConfig()
  if (config.remoteDialogSeen) return false
  if (!isBridgeEnabled()) return false
  const tokens = getClaudeAIOAuthTokens()
  if (!tokens?.accessToken) return false
  return true
}
