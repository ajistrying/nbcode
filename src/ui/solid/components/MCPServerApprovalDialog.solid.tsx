import type { JSX } from '@opentui/solid'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  getSettings_DEPRECATED,
  updateSettingsForSource,
} from '../../../utils/settings/settings.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { MCPServerDialogCopy } from './MCPServerDialogCopy.solid.js'

type Props = {
  serverName: string
  onDone(): void
}

export function MCPServerApprovalDialog(props: Props): JSX.Element {
  function onChange(value: 'yes' | 'yes_all' | 'no') {
    logEvent('tengu_mcp_dialog_choice', {
      choice:
        value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    switch (value) {
      case 'yes':
      case 'yes_all': {
        const currentSettings = getSettings_DEPRECATED() || {}
        const enabledServers = currentSettings.enabledMcpjsonServers || []

        if (!enabledServers.includes(props.serverName)) {
          updateSettingsForSource('localSettings', {
            enabledMcpjsonServers: [...enabledServers, props.serverName],
          })
        }

        if (value === 'yes_all') {
          updateSettingsForSource('localSettings', {
            enableAllProjectMcpServers: true,
          })
        }
        props.onDone()
        break
      }
      case 'no': {
        const currentSettings = getSettings_DEPRECATED() || {}
        const disabledServers = currentSettings.disabledMcpjsonServers || []

        if (!disabledServers.includes(props.serverName)) {
          updateSettingsForSource('localSettings', {
            disabledMcpjsonServers: [...disabledServers, props.serverName],
          })
        }
        props.onDone()
        break
      }
    }
  }

  return (
    <Dialog
      title={`New MCP server found in .mcp.json: ${props.serverName}`}
      color="warning"
      onCancel={() => onChange('no')}
    >
      <MCPServerDialogCopy />

      <Select
        options={[
          {
            label: 'Use this and all future MCP servers in this project',
            value: 'yes_all',
          },
          { label: 'Use this MCP server', value: 'yes' },
          { label: 'Continue without using this MCP server', value: 'no' },
        ]}
        onChange={value => onChange(value as 'yes_all' | 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  )
}
