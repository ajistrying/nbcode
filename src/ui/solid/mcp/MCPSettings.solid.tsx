import { createSignal, createMemo, createEffect, onMount, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import type { CommandResultDisplay } from '../../../commands.js'
import { ClaudeAuthProvider } from '../../../services/mcp/auth.js'
import type {
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../../services/mcp/types.js'
import {
  extractAgentMcpServers,
  filterToolsByServer,
} from '../../../services/mcp/utils.js'
import { useAppState } from '../../../state/AppState.js'
import { getSessionIngressAuthToken } from '../../../utils/sessionIngressAuth.js'
import { MCPAgentServerMenu } from './MCPAgentServerMenu.solid.js'
import { MCPListPanel } from './MCPListPanel.solid.js'
import { MCPRemoteServerMenu } from '../../components/mcp/MCPRemoteServerMenu.js'
import { MCPStdioServerMenu } from './MCPStdioServerMenu.solid.js'
import { MCPToolDetailView } from './MCPToolDetailView.solid.js'
import { MCPToolListView } from '../../components/mcp/MCPToolListView.js'
import type { AgentMcpServerInfo, MCPViewState, ServerInfo } from '../../components/mcp/types.js'

type Props = {
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function MCPSettings(props: Props): JSX.Element {
  const mcp = useAppState(s => s.mcp)
  const agentDefinitions = useAppState(s => s.agentDefinitions)
  const mcpClients = () => mcp.clients
  const [viewState, setViewState] = createSignal<MCPViewState>({
    type: 'list',
  })
  const [servers, setServers] = createSignal<ServerInfo[]>([])

  const agentMcpServers = createMemo(
    () => extractAgentMcpServers(agentDefinitions.allAgents),
  )

  const filteredClients = createMemo(
    () =>
      mcpClients()
        .filter((client: any) => client.name !== 'ide')
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
  )

  createEffect(() => {
    let cancelled = false
    const clients = filteredClients()
    const mcpTools = mcp.tools

    async function prepareServers() {
      const serverInfos = await Promise.all(
        clients.map(async (client: any) => {
          const scope = client.config.scope
          const isSSE = client.config.type === 'sse'
          const isHTTP = client.config.type === 'http'
          const isClaudeAIProxy = client.config.type === 'claudeai-proxy'
          let isAuthenticated: boolean | undefined = undefined

          if (isSSE || isHTTP) {
            const authProvider = new ClaudeAuthProvider(
              client.name,
              client.config as McpSSEServerConfig | McpHTTPServerConfig,
            )
            const tokens = await authProvider.tokens()
            const hasSessionAuth =
              getSessionIngressAuthToken() !== null &&
              client.type === 'connected'
            const hasToolsAndConnected =
              client.type === 'connected' &&
              filterToolsByServer(mcpTools, client.name).length > 0
            isAuthenticated =
              Boolean(tokens) || hasSessionAuth || hasToolsAndConnected
          }

          const baseInfo = {
            name: client.name,
            client,
            scope,
          }

          if (isClaudeAIProxy) {
            return {
              ...baseInfo,
              transport: 'claudeai-proxy' as const,
              isAuthenticated: false,
              config: client.config as McpClaudeAIProxyServerConfig,
            }
          } else if (isSSE) {
            return {
              ...baseInfo,
              transport: 'sse' as const,
              isAuthenticated,
              config: client.config as McpSSEServerConfig,
            }
          } else if (isHTTP) {
            return {
              ...baseInfo,
              transport: 'http' as const,
              isAuthenticated,
              config: client.config as McpHTTPServerConfig,
            }
          } else {
            return {
              ...baseInfo,
              transport: 'stdio' as const,
              config: client.config as McpStdioServerConfig,
            }
          }
        }),
      )

      if (cancelled) return
      setServers(serverInfos)
    }

    void prepareServers()
    // Cleanup for SolidJS effect
    return () => {
      cancelled = true
    }
  })

  createEffect(() => {
    if (servers().length === 0 && filteredClients().length > 0) {
      return
    }

    if (servers().length === 0 && agentMcpServers().length === 0) {
      props.onComplete(
        'No MCP servers configured. Please run /doctor if this is unexpected. Otherwise, run `claude mcp --help` or visit https://code.claude.com/docs/en/mcp to learn more.',
      )
    }
  })

  const vs = viewState

  return (
    <>
      <Show when={vs().type === 'list'}>
        <MCPListPanel
          servers={servers()}
          agentServers={agentMcpServers()}
          onSelectServer={(server: ServerInfo) =>
            setViewState({ type: 'server-menu', server })
          }
          onSelectAgentServer={(agentServer: AgentMcpServerInfo) =>
            setViewState({ type: 'agent-server-menu', agentServer })
          }
          onComplete={props.onComplete}
          defaultTab={(vs() as any).defaultTab}
        />
      </Show>
      <Show when={vs().type === 'server-menu'}>
        {(() => {
          const server = (vs() as any).server as ServerInfo
          const serverTools = filterToolsByServer(mcp.tools, server.name)
          const defaultTab =
            server.transport === 'claudeai-proxy' ? 'claude.ai' : 'Claude Code'

          return (
            <Show
              when={server.transport === 'stdio'}
              fallback={
                <MCPRemoteServerMenu
                  server={server}
                  serverToolsCount={serverTools.length}
                  onViewTools={() =>
                    setViewState({ type: 'server-tools', server })
                  }
                  onCancel={() => setViewState({ type: 'list', defaultTab })}
                  onComplete={props.onComplete}
                />
              }
            >
              <MCPStdioServerMenu
                server={server}
                serverToolsCount={serverTools.length}
                onViewTools={() =>
                  setViewState({ type: 'server-tools', server })
                }
                onCancel={() => setViewState({ type: 'list', defaultTab })}
                onComplete={props.onComplete}
              />
            </Show>
          )
        })()}
      </Show>
      <Show when={vs().type === 'server-tools'}>
        <MCPToolListView
          server={(vs() as any).server}
          onSelectTool={(_: any, index: number) =>
            setViewState({
              type: 'server-tool-detail',
              server: (vs() as any).server,
              toolIndex: index,
            })
          }
          onBack={() =>
            setViewState({ type: 'server-menu', server: (vs() as any).server })
          }
        />
      </Show>
      <Show when={vs().type === 'server-tool-detail'}>
        {(() => {
          const state = vs() as any
          const serverTools = filterToolsByServer(mcp.tools, state.server.name)
          const tool = serverTools[state.toolIndex]
          if (!tool) {
            setViewState({ type: 'server-tools', server: state.server })
            return null
          }
          return (
            <MCPToolDetailView
              tool={tool}
              server={state.server}
              onBack={() =>
                setViewState({ type: 'server-tools', server: state.server })
              }
            />
          )
        })()}
      </Show>
      <Show when={vs().type === 'agent-server-menu'}>
        <MCPAgentServerMenu
          agentServer={(vs() as any).agentServer}
          onCancel={() => setViewState({ type: 'list', defaultTab: 'Agents' })}
          onComplete={props.onComplete}
        />
      </Show>
    </>
  )
}
