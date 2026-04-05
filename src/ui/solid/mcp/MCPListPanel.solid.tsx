import type { JSX } from '@opentui/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import figures from 'figures'
import type { CommandResultDisplay } from '../../../commands.js'
import { color, useTheme } from '../../../ink.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import type { ConfigScope } from '../../../services/mcp/types.js'
import { describeMcpConfigFilePath } from '../../../services/mcp/utils.js'
import { isDebugMode } from '../../../utils/debug.js'
import { plural } from '../../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { McpParsingWarnings } from '../../components/mcp/McpParsingWarnings.js'
import type { AgentMcpServerInfo, ServerInfo } from '../../components/mcp/types.js'

type Props = {
  servers: ServerInfo[]
  agentServers?: AgentMcpServerInfo[]
  onSelectServer: (server: ServerInfo) => void
  onSelectAgentServer?: (agentServer: AgentMcpServerInfo) => void
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  defaultTab?: string
}

type SelectableItem =
  | { type: 'server'; server: ServerInfo }
  | { type: 'agent-server'; agentServer: AgentMcpServerInfo }

const SCOPE_ORDER: ConfigScope[] = ['project', 'local', 'user', 'enterprise']

function getScopeHeading(scope: ConfigScope): { label: string; path?: string } {
  switch (scope) {
    case 'project':
      return { label: 'Project MCPs', path: describeMcpConfigFilePath(scope) }
    case 'user':
      return { label: 'User MCPs', path: describeMcpConfigFilePath(scope) }
    case 'local':
      return { label: 'Local MCPs', path: describeMcpConfigFilePath(scope) }
    case 'enterprise':
      return { label: 'Enterprise MCPs' }
    case 'dynamic':
      return { label: 'Built-in MCPs', path: 'always available' }
    default:
      return { label: scope }
  }
}

function groupServersByScope(
  serverList: ServerInfo[],
): Map<ConfigScope, ServerInfo[]> {
  const groups = new Map<ConfigScope, ServerInfo[]>()
  for (const server of serverList) {
    const scope = server.scope
    if (!groups.has(scope)) {
      groups.set(scope, [])
    }
    groups.get(scope)!.push(server)
  }
  for (const [, groupServers] of groups) {
    groupServers.sort((a, b) => a.name.localeCompare(b.name))
  }
  return groups
}

export function MCPListPanel(props: Props): JSX.Element {
  const [theme] = useTheme()
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const serversByScope = createMemo(() => {
    const regularServers = props.servers.filter(
      s => s.client.config.type !== 'claudeai-proxy',
    )
    return groupServersByScope(regularServers)
  })

  const claudeAiServers = createMemo(() =>
    props.servers
      .filter(s => s.client.config.type === 'claudeai-proxy')
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  const dynamicServers = createMemo(() =>
    (serversByScope().get('dynamic') ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  )

  const dynamicHeading = getScopeHeading('dynamic')

  const selectableItems = createMemo(() => {
    const items: SelectableItem[] = []
    for (const scope of SCOPE_ORDER) {
      const scopeServers = serversByScope().get(scope) ?? []
      for (const server of scopeServers) {
        items.push({ type: 'server', server })
      }
    }
    for (const server of claudeAiServers()) {
      items.push({ type: 'server', server })
    }
    for (const agentServer of (props.agentServers ?? [])) {
      items.push({ type: 'agent-server', agentServer })
    }
    for (const server of dynamicServers()) {
      items.push({ type: 'server', server })
    }
    return items
  })

  const handleCancel = (): void => {
    props.onComplete('MCP dialog dismissed', {
      display: 'system',
    })
  }

  const handleSelect = (): void => {
    const item = selectableItems()[selectedIndex()]
    if (!item) return
    if (item.type === 'server') {
      props.onSelectServer(item.server)
    } else if (item.type === 'agent-server' && props.onSelectAgentServer) {
      props.onSelectAgentServer(item.agentServer)
    }
  }

  useKeybindings(
    {
      'confirm:previous': () =>
        setSelectedIndex(prev =>
          prev === 0 ? selectableItems().length - 1 : prev - 1,
        ),
      'confirm:next': () =>
        setSelectedIndex(prev =>
          prev === selectableItems().length - 1 ? 0 : prev + 1,
        ),
      'confirm:yes': handleSelect,
      'confirm:no': handleCancel,
    },
    { context: 'Confirmation' },
  )

  const getServerIndex = (server: ServerInfo): number => {
    return selectableItems().findIndex(
      item => item.type === 'server' && item.server === server,
    )
  }

  const getAgentServerIndex = (agentServer: AgentMcpServerInfo): number => {
    return selectableItems().findIndex(
      item => item.type === 'agent-server' && item.agentServer === agentServer,
    )
  }

  const debugMode = isDebugMode()
  const hasFailedClients = () => props.servers.some(s => s.client.type === 'failed')

  const renderServerItem = (server: ServerInfo): JSX.Element => {
    const index = getServerIndex(server)
    const isSelected = () => selectedIndex() === index
    const statusInfo = () => {
      if (server.client.type === 'disabled') {
        return {
          icon: color('inactive', theme)(figures.radioOff),
          text: 'disabled',
        }
      } else if (server.client.type === 'connected') {
        return {
          icon: color('success', theme)(figures.tick),
          text: 'connected',
        }
      } else if (server.client.type === 'pending') {
        const { reconnectAttempt, maxReconnectAttempts } = server.client as any
        const text =
          reconnectAttempt && maxReconnectAttempts
            ? `reconnecting (${reconnectAttempt}/${maxReconnectAttempts})...`
            : 'connecting...'
        return {
          icon: color('inactive', theme)(figures.radioOff),
          text,
        }
      } else if (server.client.type === 'needs-auth') {
        return {
          icon: color('warning', theme)(figures.triangleUpOutline),
          text: 'needs authentication',
        }
      } else {
        return {
          icon: color('error', theme)(figures.cross),
          text: 'failed',
        }
      }
    }

    return (
      <box>
        <text fg={isSelected() ? 'suggestion' : undefined}>
          {isSelected() ? `${figures.pointer} ` : '  '}
        </text>
        <text fg={isSelected() ? 'suggestion' : undefined}>{server.name}</text>
        <text dimmed={!isSelected()}> {'\u00B7'} {statusInfo().icon} </text>
        <text dimmed={!isSelected()}>{statusInfo().text}</text>
      </box>
    )
  }

  const renderAgentServerItem = (agentServer: AgentMcpServerInfo): JSX.Element => {
    const index = getAgentServerIndex(agentServer)
    const isSelected = () => selectedIndex() === index
    const statusIcon = () =>
      agentServer.needsAuth
        ? color('warning', theme)(figures.triangleUpOutline)
        : color('inactive', theme)(figures.radioOff)
    const statusText = () => (agentServer.needsAuth ? 'may need auth' : 'agent-only')

    return (
      <box>
        <text fg={isSelected() ? 'suggestion' : undefined}>
          {isSelected() ? `${figures.pointer} ` : '  '}
        </text>
        <text fg={isSelected() ? 'suggestion' : undefined}>
          {agentServer.name}
        </text>
        <text dimmed={!isSelected()}> {'\u00B7'} {statusIcon()} </text>
        <text dimmed={!isSelected()}>{statusText()}</text>
      </box>
    )
  }

  const totalServers = () => props.servers.length + (props.agentServers ?? []).length

  return (
    <Show when={props.servers.length > 0 || (props.agentServers ?? []).length > 0}>
      <box flexDirection="column">
        <McpParsingWarnings />

        <Dialog
          title="Manage MCP servers"
          subtitle={`${totalServers()} ${plural(totalServers(), 'server')}`}
          onCancel={handleCancel}
          hideInputGuide
        >
          <box flexDirection="column">
            {/* Regular servers grouped by scope */}
            <For each={SCOPE_ORDER}>
              {(scope) => {
                const scopeServers = () => serversByScope().get(scope)
                const heading = getScopeHeading(scope)
                return (
                  <Show when={scopeServers() && scopeServers()!.length > 0}>
                    <box flexDirection="column" marginBottom={1}>
                      <box paddingLeft={2}>
                        <text><b>{heading.label}</b></text>
                        <Show when={heading.path}>
                          <text dimmed> ({heading.path})</text>
                        </Show>
                      </box>
                      <For each={scopeServers()!}>
                        {(server) => renderServerItem(server)}
                      </For>
                    </box>
                  </Show>
                )
              }}
            </For>

            {/* Claude.ai servers section */}
            <Show when={claudeAiServers().length > 0}>
              <box flexDirection="column" marginBottom={1}>
                <box paddingLeft={2}>
                  <text><b>claude.ai</b></text>
                </box>
                <For each={claudeAiServers()}>
                  {(server) => renderServerItem(server)}
                </For>
              </box>
            </Show>

            {/* Agent servers section */}
            <Show when={(props.agentServers ?? []).length > 0}>
              <box flexDirection="column" marginBottom={1}>
                <box paddingLeft={2}>
                  <text><b>Agent MCPs</b></text>
                </box>
                <For each={[...new Set((props.agentServers ?? []).flatMap(s => s.sourceAgents))]}>
                  {(agentName) => (
                    <box flexDirection="column" marginTop={1}>
                      <box paddingLeft={2}>
                        <text dimmed>@{agentName}</text>
                      </box>
                      <For each={(props.agentServers ?? []).filter(s => s.sourceAgents.includes(agentName))}>
                        {(agentServer) => renderAgentServerItem(agentServer)}
                      </For>
                    </box>
                  )}
                </For>
              </box>
            </Show>

            {/* Built-in (dynamic) servers section */}
            <Show when={dynamicServers().length > 0}>
              <box flexDirection="column" marginBottom={1}>
                <box paddingLeft={2}>
                  <text><b>{dynamicHeading.label}</b></text>
                  <Show when={dynamicHeading.path}>
                    <text dimmed> ({dynamicHeading.path})</text>
                  </Show>
                </box>
                <For each={dynamicServers()}>
                  {(server) => renderServerItem(server)}
                </For>
              </box>
            </Show>

            {/* Footer info */}
            <box flexDirection="column">
              <Show when={hasFailedClients()}>
                <text dimmed>
                  {debugMode
                    ? '※ Error logs shown inline with --debug'
                    : '※ Run claude --debug to see error logs'}
                </text>
              </Show>
              <text dimmed>
                https://code.claude.com/docs/en/mcp for help
              </text>
            </box>
          </box>
        </Dialog>

        {/* Custom footer with navigation hint */}
        <box paddingX={1}>
          <text dimmed>
            <Byline>
              <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </text>
        </box>
      </box>
    </Show>
  )
}
