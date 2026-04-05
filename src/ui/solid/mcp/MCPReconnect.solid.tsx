import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import figures from 'figures'
import type { CommandResultDisplay } from '../../../commands.js'
import { color, useTheme } from '../../../ink.js'
import { useMcpReconnect } from '../../../services/mcp/MCPConnectionManager.js'
import { useAppStateStore } from '../../../state/AppState.js'
import { Spinner } from '../../solid/Spinner.solid.js'

type Props = {
  serverName: string
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function MCPReconnect(props: Props): JSX.Element {
  const [theme] = useTheme()
  const store = useAppStateStore()
  const reconnectMcpServer = useMcpReconnect()
  const [isReconnecting, setIsReconnecting] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  onMount(() => {
    async function attemptReconnect() {
      try {
        const server = store
          .getState()
          .mcp.clients.find(c => c.name === props.serverName)
        if (!server) {
          setError(`MCP server "${props.serverName}" not found`)
          setIsReconnecting(false)
          props.onComplete(`MCP server "${props.serverName}" not found`)
          return
        }

        const result = await reconnectMcpServer(props.serverName)

        switch (result.client.type) {
          case 'connected':
            setIsReconnecting(false)
            props.onComplete(`Successfully reconnected to ${props.serverName}`)
            break
          case 'needs-auth':
            setError(`${props.serverName} requires authentication`)
            setIsReconnecting(false)
            props.onComplete(
              `${props.serverName} requires authentication. Use /mcp to authenticate.`,
            )
            break
          case 'pending':
          case 'failed':
          case 'disabled':
            setError(`Failed to reconnect to ${props.serverName}`)
            setIsReconnecting(false)
            props.onComplete(`Failed to reconnect to ${props.serverName}`)
            break
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(errorMessage)
        setIsReconnecting(false)
        props.onComplete(`Error: ${errorMessage}`)
      }
    }

    void attemptReconnect()
  })

  return (
    <>
      <Show when={isReconnecting()}>
        <box flexDirection="column" gap={1} padding={1}>
          <text fg="text">
            Reconnecting to <b>{props.serverName}</b>
          </text>
          <box>
            <Spinner />
            <text> Establishing connection to MCP server</text>
          </box>
        </box>
      </Show>

      <Show when={!isReconnecting() && error()}>
        <box flexDirection="column" gap={1} padding={1}>
          <box>
            <text>{color('error', theme)(figures.cross)} </text>
            <text fg="error">Failed to reconnect to {props.serverName}</text>
          </box>
          <text dimmed>Error: {error()}</text>
        </box>
      </Show>
    </>
  )
}
