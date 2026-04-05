import type { JSX } from '@opentui/solid'
import { createEffect, createSignal, For, Show } from 'solid-js'
import {
  extractMcpToolDisplayName,
  getMcpDisplayName,
} from '../../../services/mcp/mcpStringUtils.js'
import type { Tool } from '../../../Tool.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import type { ServerInfo } from '../../components/mcp/types.js'

type Props = {
  tool: Tool
  server: ServerInfo
  onBack: () => void
}

export function MCPToolDetailView(props: Props): JSX.Element {
  const [toolDescription, setToolDescription] = createSignal('')

  const toolName = () => getMcpDisplayName(props.tool.name, props.server.name)
  const fullDisplayName = () =>
    props.tool.userFacingName
      ? props.tool.userFacingName({})
      : toolName()
  const displayName = () => extractMcpToolDisplayName(fullDisplayName())

  const isReadOnly = () => props.tool.isReadOnly?.({}) ?? false
  const isDestructive = () => props.tool.isDestructive?.({}) ?? false
  const isOpenWorld = () => props.tool.isOpenWorld?.({}) ?? false

  createEffect(() => {
    const currentTool = props.tool
    async function loadDescription() {
      try {
        const desc = await currentTool.description(
          {},
          {
            isNonInteractiveSession: false,
            toolPermissionContext: {
              mode: 'default' as const,
              additionalWorkingDirectories: new Map(),
              alwaysAllowRules: {},
              alwaysDenyRules: {},
              alwaysAskRules: {},
              isBypassPermissionsModeAvailable: false,
            },
            tools: [],
          },
        )
        setToolDescription(desc)
      } catch {
        setToolDescription('Failed to load description')
      }
    }
    void loadDescription()
  })

  const titleContent = () => (
    <>
      {displayName()}
      <Show when={isReadOnly()}>
        <text fg="success"> [read-only]</text>
      </Show>
      <Show when={isDestructive()}>
        <text fg="error"> [destructive]</text>
      </Show>
      <Show when={isOpenWorld()}>
        <text dimmed> [open-world]</text>
      </Show>
    </>
  )

  const properties = () => {
    const schema = props.tool.inputJSONSchema
    if (!schema?.properties) return []
    return Object.entries(schema.properties)
  }

  return (
    <Dialog
      title={titleContent()}
      subtitle={props.server.name}
      onCancel={props.onBack}
      inputGuide={(exitState: any) =>
        exitState.pending ? (
          <text>Press {exitState.keyName} again to exit</text>
        ) : (
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="go back"
          />
        )
      }
    >
      <box flexDirection="column">
        <box>
          <text><b>Tool name: </b></text>
          <text dimmed>{toolName()}</text>
        </box>

        <box>
          <text><b>Full name: </b></text>
          <text dimmed>{props.tool.name}</text>
        </box>

        <Show when={toolDescription()}>
          <box flexDirection="column" marginTop={1}>
            <text><b>Description:</b></text>
            <text>{toolDescription()}</text>
          </box>
        </Show>

        <Show when={properties().length > 0}>
          <box flexDirection="column" marginTop={1}>
            <text><b>Parameters:</b></text>
            <box marginLeft={2} flexDirection="column">
              <For each={properties()}>
                {([key, value]) => {
                  const required = () =>
                    props.tool.inputJSONSchema?.required as string[] | undefined
                  const isRequired = () => required()?.includes(key)
                  return (
                    <text>
                      {'\u2022'} {key}
                      <Show when={isRequired()}>
                        <text dimmed> (required)</text>
                      </Show>
                      :{' '}
                      <text dimmed>
                        {typeof value === 'object' && value && 'type' in value
                          ? String((value as any).type)
                          : 'unknown'}
                      </text>
                      <Show when={typeof value === 'object' && value && 'description' in value}>
                        <text dimmed> - {String((value as any).description)}</text>
                      </Show>
                    </text>
                  )
                }}
              </For>
            </box>
          </box>
        </Show>
      </box>
    </Dialog>
  )
}
