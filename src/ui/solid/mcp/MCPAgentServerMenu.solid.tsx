import figures from 'figures'
import { createSignal, createEffect, onCleanup, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import type { CommandResultDisplay } from '../../../commands.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  AuthenticationCancelledError,
  performMCPOAuthFlow,
} from '../../../services/mcp/auth.js'
import { capitalize } from '../../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../components/ConfigurableShortcutHint.solid.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../design-system/Byline.solid.js'
import { Dialog } from '../design-system/Dialog.solid.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.solid.js'
import { Spinner } from '../Spinner/Spinner.solid.js'
import type { AgentMcpServerInfo } from '../../components/mcp/types.js'

type Props = {
  agentServer: AgentMcpServerInfo
  onCancel: () => void
  onComplete?: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function MCPAgentServerMenu(props: Props): JSX.Element {
  const [isAuthenticating, setIsAuthenticating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [authorizationUrl, setAuthorizationUrl] = createSignal<string | null>(null)
  let authAbortControllerRef: AbortController | null = null

  // Abort OAuth flow on unmount
  onCleanup(() => authAbortControllerRef?.abort())

  const handleEscCancel = () => {
    if (isAuthenticating()) {
      authAbortControllerRef?.abort()
      authAbortControllerRef = null
      setIsAuthenticating(false)
      setAuthorizationUrl(null)
    }
  }

  useKeybinding('confirm:no', handleEscCancel, {
    context: 'Confirmation',
    isActive: isAuthenticating(),
  })

  const handleAuthenticate = async () => {
    if (!props.agentServer.needsAuth || !props.agentServer.url) {
      return
    }

    setIsAuthenticating(true)
    setError(null)

    const controller = new AbortController()
    authAbortControllerRef = controller

    try {
      const tempConfig = {
        type: props.agentServer.transport as 'http' | 'sse',
        url: props.agentServer.url,
      }

      await performMCPOAuthFlow(
        props.agentServer.name,
        tempConfig,
        setAuthorizationUrl,
        controller.signal,
      )

      props.onComplete?.(
        `Authentication successful for ${props.agentServer.name}. The server will connect when the agent runs.`,
      )
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
    }
  }

  const capitalizedServerName = capitalize(String(props.agentServer.name))

  const menuOptions = () => {
    const opts: { label: string; value: string }[] = []
    if (props.agentServer.needsAuth) {
      opts.push({
        label: props.agentServer.isAuthenticated ? 'Re-authenticate' : 'Authenticate',
        value: 'auth',
      })
    }
    opts.push({ label: 'Back', value: 'back' })
    return opts
  }

  return (
    <>
      <Show when={isAuthenticating()}>
        <box flexDirection="column" gap={1} padding={1}>
          <text fg="claude">Authenticating with {props.agentServer.name}…</text>
          <box>
            <Spinner />
            <text> A browser window will open for authentication</text>
          </box>
          <Show when={authorizationUrl()}>
            <box flexDirection="column">
              <text dimmed>
                If your browser doesn&apos;t open automatically, copy this URL
                manually:
              </text>
              <text>{authorizationUrl()}</text>
            </box>
          </Show>
          <box marginLeft={3}>
            <text dimmed>
              Return here after authenticating in your browser.{' '}
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="go back"
              />
            </text>
          </box>
        </box>
      </Show>
      <Show when={!isAuthenticating()}>
        <Dialog
          title={`${capitalizedServerName} MCP Server`}
          subtitle="agent-only"
          onCancel={props.onCancel}
          inputGuide={(exitState: any) =>
            exitState.pending ? (
              <text>Press {exitState.keyName} again to exit</text>
            ) : (
              <Byline>
                <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
                <KeyboardShortcutHint shortcut="Enter" action="confirm" />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="go back"
                />
              </Byline>
            )
          }
        >
          <box flexDirection="column" gap={0}>
            <box>
              <text><b>Type: </b></text>
              <text dimmed>{props.agentServer.transport}</text>
            </box>

            <Show when={props.agentServer.url}>
              <box>
                <text><b>URL: </b></text>
                <text dimmed>{props.agentServer.url}</text>
              </box>
            </Show>

            <Show when={props.agentServer.command}>
              <box>
                <text><b>Command: </b></text>
                <text dimmed>{props.agentServer.command}</text>
              </box>
            </Show>

            <box>
              <text><b>Used by: </b></text>
              <text dimmed>{props.agentServer.sourceAgents.join(', ')}</text>
            </box>

            <box marginTop={1}>
              <text><b>Status: </b></text>
              <text>
                {figures.radioOff} not connected (agent-only)
              </text>
            </box>

            <Show when={props.agentServer.needsAuth}>
              <box>
                <text><b>Auth: </b></text>
                <Show
                  when={props.agentServer.isAuthenticated}
                  fallback={
                    <text>
                      {figures.triangleUpOutline} may need authentication
                    </text>
                  }
                >
                  <text>{figures.tick} authenticated</text>
                </Show>
              </box>
            </Show>
          </box>

          <box>
            <text dimmed>This server connects only when running the agent.</text>
          </box>

          <Show when={error()}>
            <box>
              <text fg="error">Error: {error()}</text>
            </box>
          </Show>

          <box>
            <Select
              options={menuOptions()}
              onChange={async (value: string) => {
                switch (value) {
                  case 'auth':
                    await handleAuthenticate()
                    break
                  case 'back':
                    props.onCancel()
                    break
                }
              }}
              onCancel={props.onCancel}
            />
          </box>
        </Dialog>
      </Show>
    </>
  )
}
