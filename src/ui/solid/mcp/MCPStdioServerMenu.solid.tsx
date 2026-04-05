import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import figures from 'figures'
import type { CommandResultDisplay } from '../../../commands.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { color, useTheme } from '../../../ink.js'
import { getMcpConfigByName } from '../../../services/mcp/config.js'
import {
  useMcpReconnect,
  useMcpToggleEnabled,
} from '../../../services/mcp/MCPConnectionManager.js'
import {
  describeMcpConfigFilePath,
  filterMcpPromptsByServer,
} from '../../../services/mcp/utils.js'
import { useAppState } from '../../../state/AppState.js'
import { errorMessage } from '../../../utils/errors.js'
import { capitalize } from '../../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { Spinner } from '../../solid/Spinner.solid.js'
import { CapabilitiesSection } from '../../components/mcp/CapabilitiesSection.js'
import type { StdioServerInfo } from '../../components/mcp/types.js'
import {
  handleReconnectError,
  handleReconnectResult,
} from '../../components/mcp/utils/reconnectHelpers.js'

type Props = {
  server: StdioServerInfo
  serverToolsCount: number
  onViewTools: () => void
  onCancel: () => void
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  borderless?: boolean
}

export function MCPStdioServerMenu(props: Props): JSX.Element {
  const [theme] = useTheme()
  const exitState = useExitOnCtrlCDWithKeybindings()
  const mcp = useAppState(s => s.mcp)
  const reconnectMcpServer = useMcpReconnect()
  const toggleMcpServer = useMcpToggleEnabled()
  const [isReconnecting, setIsReconnecting] = createSignal(false)

  const handleToggleEnabled = async () => {
    const wasEnabled = props.server.client.type !== 'disabled'

    try {
      await toggleMcpServer(props.server.name)
      props.onCancel()
    } catch (err) {
      const action = wasEnabled ? 'disable' : 'enable'
      props.onComplete(
        `Failed to ${action} MCP server '${props.server.name}': ${errorMessage(err)}`,
      )
    }
  }

  const capitalizedServerName = () => capitalize(String(props.server.name))

  const serverCommandsCount = () =>
    filterMcpPromptsByServer(mcp.commands, props.server.name).length

  const menuOptions = () => {
    const opts: { label: string; value: string }[] = []

    if (props.server.client.type !== 'disabled' && props.serverToolsCount > 0) {
      opts.push({ label: 'View tools', value: 'tools' })
    }

    if (props.server.client.type !== 'disabled') {
      opts.push({ label: 'Reconnect', value: 'reconnectMcpServer' })
    }

    opts.push({
      label: props.server.client.type !== 'disabled' ? 'Disable' : 'Enable',
      value: 'toggle-enabled',
    })

    if (opts.length === 0) {
      opts.push({ label: 'Back', value: 'back' })
    }

    return opts
  }

  return (
    <Show
      when={!isReconnecting()}
      fallback={
        <box flexDirection="column" gap={1} padding={1}>
          <text fg="text">
            Reconnecting to <b>{props.server.name}</b>
          </text>
          <box>
            <Spinner />
            <text> Restarting MCP server process</text>
          </box>
          <text dimmed>This may take a few moments.</text>
        </box>
      }
    >
      <box flexDirection="column">
        <box
          flexDirection="column"
          paddingX={1}
          borderStyle={(props.borderless ?? false) ? undefined : 'round'}
        >
          <box marginBottom={1}>
            <text><b>{capitalizedServerName()} MCP Server</b></text>
          </box>

          <box flexDirection="column" gap={0}>
            <box>
              <text><b>Status: </b></text>
              <Show when={props.server.client.type === 'disabled'}>
                <text>{color('inactive', theme)(figures.radioOff)} disabled</text>
              </Show>
              <Show when={props.server.client.type === 'connected'}>
                <text>{color('success', theme)(figures.tick)} connected</text>
              </Show>
              <Show when={props.server.client.type === 'pending'}>
                <text dimmed>{figures.radioOff}</text>
                <text> connecting...</text>
              </Show>
              <Show when={props.server.client.type === 'failed' || props.server.client.type === 'needs-auth'}>
                <text>{color('error', theme)(figures.cross)} failed</text>
              </Show>
            </box>

            <box>
              <text><b>Command: </b></text>
              <text dimmed>{props.server.config.command}</text>
            </box>

            <Show when={props.server.config.args && props.server.config.args.length > 0}>
              <box>
                <text><b>Args: </b></text>
                <text dimmed>{props.server.config.args?.join(' ')}</text>
              </box>
            </Show>

            <box>
              <text><b>Config location: </b></text>
              <text dimmed>
                {describeMcpConfigFilePath(
                  getMcpConfigByName(props.server.name)?.scope ?? 'dynamic',
                )}
              </text>
            </box>

            <Show when={props.server.client.type === 'connected'}>
              <CapabilitiesSection
                serverToolsCount={props.serverToolsCount}
                serverPromptsCount={serverCommandsCount()}
                serverResourcesCount={mcp.resources[props.server.name]?.length || 0}
              />
            </Show>

            <Show when={props.server.client.type === 'connected' && props.serverToolsCount > 0}>
              <box>
                <text><b>Tools: </b></text>
                <text dimmed>{props.serverToolsCount} tools</text>
              </box>
            </Show>
          </box>

          <Show when={menuOptions().length > 0}>
            <box marginTop={1}>
              <Select
                options={menuOptions()}
                onChange={async (value: string) => {
                  if (value === 'tools') {
                    props.onViewTools()
                  } else if (value === 'reconnectMcpServer') {
                    setIsReconnecting(true)
                    try {
                      const result = await reconnectMcpServer(props.server.name)
                      const { message } = handleReconnectResult(
                        result,
                        props.server.name,
                      )
                      props.onComplete?.(message)
                    } catch (err) {
                      props.onComplete?.(handleReconnectError(err, props.server.name))
                    } finally {
                      setIsReconnecting(false)
                    }
                  } else if (value === 'toggle-enabled') {
                    await handleToggleEnabled()
                  } else if (value === 'back') {
                    props.onCancel()
                  }
                }}
                onCancel={props.onCancel}
              />
            </box>
          </Show>
        </box>

        <box marginTop={1}>
          <text dimmed>
            <Show
              when={!exitState.pending}
              fallback={<>Press {exitState.keyName} again to exit</>}
            >
              <Byline>
                <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
                <KeyboardShortcutHint shortcut="Enter" action="select" />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="back"
                />
              </Byline>
            </Show>
          </text>
        </box>
      </box>
    </Show>
  )
}
