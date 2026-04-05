import figures from 'figures'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { getOauthConfig } from '../../../constants/oauth.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  AuthenticationCancelledError,
  performMCPOAuthFlow,
  revokeServerTokens,
} from '../../../services/mcp/auth.js'
import { clearServerCache } from '../../../services/mcp/client.js'
import {
  useMcpReconnect,
  useMcpToggleEnabled,
} from '../../../services/mcp/MCPConnectionManager.js'
import {
  describeMcpConfigFilePath,
  excludeCommandsByServer,
  excludeResourcesByServer,
  excludeToolsByServer,
  filterMcpPromptsByServer,
} from '../../../services/mcp/utils.js'
import {
  useAppState,
  useSetAppState,
} from '../../../state/AppState.js'
import { getOauthAccountInfo } from '../../../utils/auth.js'
import { openBrowser } from '../../../utils/browser.js'
import { errorMessage } from '../../../utils/errors.js'
import { logMCPDebug } from '../../../utils/log.js'
import { capitalize } from '../../../utils/stringUtils.js'
import type {
  ClaudeAIServerInfo,
  HTTPServerInfo,
  SSEServerInfo,
} from '../../../components/mcp/types.js'
import {
  handleReconnectError,
  handleReconnectResult,
} from '../../../components/mcp/utils/reconnectHelpers.js'

type Props = {
  server: SSEServerInfo | HTTPServerInfo | ClaudeAIServerInfo
  serverToolsCount: number
  onViewTools: () => void
  onCancel: () => void
  onComplete?: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  borderless?: boolean
}

export function MCPRemoteServerMenu(props: Props) {
  const exitState = useExitOnCtrlCDWithKeybindings()
  const { columns: terminalColumns } = useTerminalSize()
  const [isAuthenticating, setIsAuthenticating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const mcp = useAppState((s) => s.mcp)
  const setAppState = useSetAppState()
  const [authorizationUrl, setAuthorizationUrl] = createSignal<
    string | null
  >(null)
  const [isReconnecting, setIsReconnecting] = createSignal(false)
  let authAbortControllerRef: AbortController | null = null
  const [isClaudeAIAuthenticating, setIsClaudeAIAuthenticating] =
    createSignal(false)
  const [claudeAIAuthUrl, setClaudeAIAuthUrl] = createSignal<
    string | null
  >(null)
  const [isClaudeAIClearingAuth, setIsClaudeAIClearingAuth] =
    createSignal(false)
  const [claudeAIClearAuthUrl, setClaudeAIClearAuthUrl] =
    createSignal<string | null>(null)
  const [claudeAIClearAuthBrowserOpened, setClaudeAIClearAuthBrowserOpened] =
    createSignal(false)
  const [urlCopied, setUrlCopied] = createSignal(false)
  let copyTimeoutRef: ReturnType<typeof setTimeout> | undefined =
    undefined
  let unmountedRef = false
  const [callbackUrlInput, setCallbackUrlInput] = createSignal('')
  const [callbackUrlCursorOffset, setCallbackUrlCursorOffset] =
    createSignal(0)
  const [manualCallbackSubmit, setManualCallbackSubmit] = createSignal<
    ((url: string) => void) | null
  >(null)

  // Cleanup on unmount
  onCleanup(() => {
    unmountedRef = true
    authAbortControllerRef?.abort()
    if (copyTimeoutRef !== undefined) {
      clearTimeout(copyTimeoutRef)
    }
  })

  const isEffectivelyAuthenticated = () =>
    props.server.isAuthenticated ||
    (props.server.client.type === 'connected' &&
      props.serverToolsCount > 0)

  const reconnectMcpServer = useMcpReconnect()

  const handleClaudeAIAuthComplete = async () => {
    setIsClaudeAIAuthenticating(false)
    setClaudeAIAuthUrl(null)
    setIsReconnecting(true)
    try {
      const result = await reconnectMcpServer(props.server.name)
      const success = result.client.type === 'connected'
      logEvent('tengu_claudeai_mcp_auth_completed', { success })
      if (success) {
        props.onComplete?.(
          `Authentication successful. Connected to ${props.server.name}.`,
        )
      } else if (result.client.type === 'needs-auth') {
        props.onComplete?.(
          'Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.',
        )
      } else {
        props.onComplete?.(
          'Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.',
        )
      }
    } catch (err) {
      logEvent('tengu_claudeai_mcp_auth_completed', {
        success: false,
      })
      props.onComplete?.(
        handleReconnectError(err, props.server.name),
      )
    } finally {
      setIsReconnecting(false)
    }
  }

  const handleClaudeAIClearAuthComplete = async () => {
    await clearServerCache(props.server.name, {
      ...props.server.config,
      scope: props.server.scope,
    })
    setAppState((prev) => {
      const newClients = prev.mcp.clients.map((c) =>
        c.name === props.server.name
          ? { ...c, type: 'needs-auth' as const }
          : c,
      )
      const newTools = excludeToolsByServer(
        prev.mcp.tools,
        props.server.name,
      )
      const newCommands = excludeCommandsByServer(
        prev.mcp.commands,
        props.server.name,
      )
      const newResources = excludeResourcesByServer(
        prev.mcp.resources,
        props.server.name,
      )
      return {
        ...prev,
        mcp: {
          ...prev.mcp,
          clients: newClients,
          tools: newTools,
          commands: newCommands,
          resources: newResources,
        },
      }
    })
    logEvent('tengu_claudeai_mcp_clear_auth_completed', {})
    props.onComplete?.(
      `Disconnected from ${props.server.name}.`,
    )
    setIsClaudeAIClearingAuth(false)
    setClaudeAIClearAuthUrl(null)
    setClaudeAIClearAuthBrowserOpened(false)
  }

  // Escape to cancel authentication flow
  useKeybinding(
    'confirm:no',
    () => {
      authAbortControllerRef?.abort()
      authAbortControllerRef = null
      setIsAuthenticating(false)
      setAuthorizationUrl(null)
    },
    { context: 'Confirmation', isActive: isAuthenticating() },
  )

  // Escape to cancel Claude AI authentication
  useKeybinding(
    'confirm:no',
    () => {
      setIsClaudeAIAuthenticating(false)
      setClaudeAIAuthUrl(null)
    },
    {
      context: 'Confirmation',
      isActive: isClaudeAIAuthenticating(),
    },
  )

  // Escape to cancel Claude AI clear auth
  useKeybinding(
    'confirm:no',
    () => {
      setIsClaudeAIClearingAuth(false)
      setClaudeAIClearAuthUrl(null)
      setClaudeAIClearAuthBrowserOpened(false)
    },
    {
      context: 'Confirmation',
      isActive: isClaudeAIClearingAuth(),
    },
  )

  const capitalizedServerName = () =>
    capitalize(String(props.server.name))

  const serverCommandsCount = () =>
    filterMcpPromptsByServer(mcp.commands, props.server.name).length

  const toggleMcpServer = useMcpToggleEnabled()

  const handleClaudeAIAuth = async () => {
    const claudeAiBaseUrl = getOauthConfig().CLAUDE_AI_ORIGIN
    const accountInfo = getOauthAccountInfo()
    const orgUuid = accountInfo?.organizationUuid
    let authUrl: string
    if (
      orgUuid &&
      props.server.config.type === 'claudeai-proxy' &&
      props.server.config.id
    ) {
      const serverId = props.server.config.id.startsWith('mcprs')
        ? 'mcpsrv' + props.server.config.id.slice(5)
        : props.server.config.id
      const productSurface = encodeURIComponent(
        process.env.CLAUDE_CODE_ENTRYPOINT || 'cli',
      )
      authUrl = `${claudeAiBaseUrl}/api/organizations/${orgUuid}/mcp/start-auth/${serverId}?product_surface=${productSurface}`
    } else {
      authUrl = `${claudeAiBaseUrl}/settings/connectors`
    }
    setClaudeAIAuthUrl(authUrl)
    setIsClaudeAIAuthenticating(true)
    logEvent('tengu_claudeai_mcp_auth_started', {})
    await openBrowser(authUrl)
  }

  const handleClaudeAIClearAuth = () => {
    setIsClaudeAIClearingAuth(true)
    logEvent('tengu_claudeai_mcp_clear_auth_started', {})
  }

  const handleToggleEnabled = async () => {
    const wasEnabled = props.server.client.type !== 'disabled'
    try {
      await toggleMcpServer(props.server.name)
      if (props.server.config.type === 'claudeai-proxy') {
        logEvent('tengu_claudeai_mcp_toggle', {
          new_state: (
            wasEnabled ? 'disabled' : 'enabled'
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }
      props.onCancel()
    } catch (err) {
      const action = wasEnabled ? 'disable' : 'enable'
      props.onComplete?.(
        `Failed to ${action} MCP server '${props.server.name}': ${errorMessage(err)}`,
      )
    }
  }

  const handleAuthenticate = async () => {
    if (props.server.config.type === 'claudeai-proxy') return
    setIsAuthenticating(true)
    setError(null)
    const controller = new AbortController()
    authAbortControllerRef = controller
    try {
      if (props.server.isAuthenticated && props.server.config) {
        await revokeServerTokens(
          props.server.name,
          props.server.config,
          { preserveStepUpState: true },
        )
      }
      if (props.server.config) {
        await performMCPOAuthFlow(
          props.server.name,
          props.server.config,
          setAuthorizationUrl,
          controller.signal,
          {
            onWaitingForCallback: (submit) => {
              setManualCallbackSubmit(() => submit)
            },
          },
        )
        logEvent('tengu_mcp_auth_config_authenticate', {
          wasAuthenticated: props.server.isAuthenticated,
        })
        const result = await reconnectMcpServer(props.server.name)
        if (result.client.type === 'connected') {
          const message = isEffectivelyAuthenticated()
            ? `Authentication successful. Reconnected to ${props.server.name}.`
            : `Authentication successful. Connected to ${props.server.name}.`
          props.onComplete?.(message)
        } else if (result.client.type === 'needs-auth') {
          props.onComplete?.(
            'Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.',
          )
        } else {
          logMCPDebug(
            props.server.name,
            `Reconnection failed after authentication`,
          )
          props.onComplete?.(
            'Authentication successful, but server reconnection failed. You may need to manually restart Claude Code for the changes to take effect.',
          )
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !(err instanceof AuthenticationCancelledError)
      ) {
        setError(err.message)
      }
    } finally {
      setIsAuthenticating(false)
      authAbortControllerRef = null
      setManualCallbackSubmit(null)
      setCallbackUrlInput('')
    }
  }

  const handleClearAuth = async () => {
    if (props.server.config.type === 'claudeai-proxy') return
    if (props.server.config) {
      await revokeServerTokens(
        props.server.name,
        props.server.config,
      )
      logEvent('tengu_mcp_auth_config_clear', {})
      await clearServerCache(props.server.name, {
        ...props.server.config,
        scope: props.server.scope,
      })
      setAppState((prev) => {
        const newClients = prev.mcp.clients.map((c) =>
          c.name === props.server.name
            ? { ...c, type: 'failed' as const }
            : c,
        )
        const newTools = excludeToolsByServer(
          prev.mcp.tools,
          props.server.name,
        )
        const newCommands = excludeCommandsByServer(
          prev.mcp.commands,
          props.server.name,
        )
        const newResources = excludeResourcesByServer(
          prev.mcp.resources,
          props.server.name,
        )
        return {
          ...prev,
          mcp: {
            ...prev.mcp,
            clients: newClients,
            tools: newTools,
            commands: newCommands,
            resources: newResources,
          },
        }
      })
      props.onComplete?.(
        `Authentication cleared for ${props.server.name}.`,
      )
    }
  }

  // Authenticating state
  if (isAuthenticating()) {
    return (
      <box flexDirection="column" gap={1} padding={1}>
        <text fg="claude">
          Authenticating with {props.server.name}...
        </text>
        <box>
          <text> A browser window will open for authentication</text>
        </box>
        <Show when={authorizationUrl()}>
          <box flexDirection="column">
            <box>
              <text dimmed>
                If your browser doesn't open automatically, copy this
                URL manually{' '}
              </text>
              <Show
                when={urlCopied()}
                fallback={<text dimmed>(c to copy)</text>}
              >
                <text fg="success">(Copied!)</text>
              </Show>
            </box>
            <text>{authorizationUrl()}</text>
          </box>
        </Show>
        <box marginLeft={3}>
          <text dimmed>
            Return here after authenticating in your browser. Press Esc
            to go back.
          </text>
        </box>
      </box>
    )
  }

  // Claude AI authenticating state
  if (isClaudeAIAuthenticating()) {
    return (
      <box flexDirection="column" gap={1} padding={1}>
        <text fg="claude">
          Authenticating with {props.server.name}...
        </text>
        <box>
          <text> A browser window will open for authentication</text>
        </box>
        <Show when={claudeAIAuthUrl()}>
          <box flexDirection="column">
            <box>
              <text dimmed>
                If your browser doesn't open automatically, copy this
                URL manually{' '}
              </text>
              <Show
                when={urlCopied()}
                fallback={<text dimmed>(c to copy)</text>}
              >
                <text fg="success">(Copied!)</text>
              </Show>
            </box>
            <text>{claudeAIAuthUrl()}</text>
          </box>
        </Show>
        <box marginLeft={3} flexDirection="column">
          <text fg="permission">
            Press <b>Enter</b> after authenticating in your browser.
          </text>
          <text dimmed>Esc to go back</text>
        </box>
      </box>
    )
  }

  // Claude AI clearing auth state
  if (isClaudeAIClearingAuth()) {
    return (
      <box flexDirection="column" gap={1} padding={1}>
        <text fg="claude">
          Clear authentication for {props.server.name}
        </text>
        <Show
          when={claudeAIClearAuthBrowserOpened()}
          fallback={
            <>
              <text>
                This will open claude.ai in the browser. Find the MCP
                server in the list and click "Disconnect".
              </text>
              <box marginLeft={3} flexDirection="column">
                <text fg="permission">
                  Press <b>Enter</b> to open the browser.
                </text>
                <text dimmed>Esc to go back</text>
              </box>
            </>
          }
        >
          <text>
            Find the MCP server in the browser and click "Disconnect".
          </text>
          <Show when={claudeAIClearAuthUrl()}>
            <box flexDirection="column">
              <box>
                <text dimmed>
                  If your browser didn't open automatically, copy this
                  URL manually{' '}
                </text>
                <Show
                  when={urlCopied()}
                  fallback={<text dimmed>(c to copy)</text>}
                >
                  <text fg="success">(Copied!)</text>
                </Show>
              </box>
              <text>{claudeAIClearAuthUrl()}</text>
            </box>
          </Show>
          <box marginLeft={3} flexDirection="column">
            <text fg="permission">
              Press <b>Enter</b> when done.
            </text>
            <text dimmed>Esc to go back</text>
          </box>
        </Show>
      </box>
    )
  }

  // Reconnecting state
  if (isReconnecting()) {
    return (
      <box flexDirection="column" gap={1} padding={1}>
        <text>
          Connecting to <b>{props.server.name}</b>...
        </text>
        <box>
          <text> Establishing connection to MCP server</text>
        </box>
        <text dimmed>This may take a few moments.</text>
      </box>
    )
  }

  // Default menu view
  return (
    <box flexDirection="column">
      <box
        flexDirection="column"
        paddingX={1}
        borderStyle={props.borderless ? undefined : 'round'}
      >
        <box marginBottom={1}>
          <text>
            <b>{capitalizedServerName()} MCP Server</b>
          </text>
        </box>
        <box flexDirection="column" gap={0}>
          <box>
            <text>
              <b>Status: </b>
            </text>
            <text>
              {props.server.client.type === 'connected'
                ? `${figures.tick} connected`
                : props.server.client.type === 'disabled'
                  ? `${figures.radioOff} disabled`
                  : props.server.client.type === 'needs-auth'
                    ? `${figures.triangleUpOutline} needs authentication`
                    : `${figures.cross} failed`}
            </text>
          </box>
          <box>
            <text>
              <b>URL: </b>
            </text>
            <text dimmed>{props.server.config.url}</text>
          </box>
          <box>
            <text>
              <b>Config location: </b>
            </text>
            <text dimmed>
              {describeMcpConfigFilePath(props.server.scope)}
            </text>
          </box>
        </box>
        <Show when={error()}>
          <box marginTop={1}>
            <text fg="error">Error: {error()}</text>
          </box>
        </Show>
        <box marginTop={1}>
          <text dimmed>
            [Menu selector - port Select component separately]
          </text>
        </box>
      </box>
      <box marginTop={1}>
        <text dimmed>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <>
              {figures.arrowUp}
              {figures.arrowDown} navigate · Enter select · Esc back
            </>
          )}
        </text>
      </box>
    </box>
  )
}
