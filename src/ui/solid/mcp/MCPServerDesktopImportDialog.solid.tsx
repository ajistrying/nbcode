import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import { gracefulShutdown } from '../../../utils/gracefulShutdown.js'
import { writeToStdout } from '../../../utils/process.js'
import { color, useTheme } from '../../../ink.js'
import { addMcpConfig, getAllMcpConfigs } from '../../../services/mcp/config.js'
import type {
  ConfigScope,
  McpServerConfig,
  ScopedMcpServerConfig,
} from '../../../services/mcp/types.js'
import { plural } from '../../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { SelectMulti } from '../../components/CustomSelect/SelectMulti.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'

type Props = {
  servers: Record<string, McpServerConfig>
  scope: ConfigScope
  onDone: () => void
}

export function MCPServerDesktopImportDialog(props: Props): JSX.Element {
  const serverNames = () => Object.keys(props.servers)
  const [existingServers, setExistingServers] = createSignal<
    Record<string, ScopedMcpServerConfig>
  >({})

  onMount(() => {
    void getAllMcpConfigs().then(({ servers }) => setExistingServers(servers))
  })

  const collisions = () =>
    serverNames().filter(name => existingServers()[name] !== undefined)

  const [theme] = useTheme()

  const done = (importedCount: number) => {
    if (importedCount > 0) {
      writeToStdout(
        `\n${color('success', theme)(`Successfully imported ${importedCount} MCP ${plural(importedCount, 'server')} to ${props.scope} config.`)}\n`,
      )
    } else {
      writeToStdout('\nNo servers were imported.')
    }
    props.onDone()
    void gracefulShutdown()
  }

  const handleEscCancel = () => {
    done(0)
  }

  async function onSubmit(selectedServers: string[]) {
    let importedCount = 0

    for (const serverName of selectedServers) {
      const serverConfig = props.servers[serverName]
      if (serverConfig) {
        let finalName = serverName
        if (existingServers()[finalName] !== undefined) {
          let counter = 1
          while (existingServers()[`${serverName}_${counter}`] !== undefined) {
            counter++
          }
          finalName = `${serverName}_${counter}`
        }

        await addMcpConfig(finalName, serverConfig, props.scope)
        importedCount++
      }
    }

    done(importedCount)
  }

  return (
    <>
      <Dialog
        title="Import MCP Servers from Claude Desktop"
        subtitle={`Found ${serverNames().length} MCP ${plural(serverNames().length, 'server')} in Claude Desktop.`}
        color="success"
        onCancel={handleEscCancel}
        hideInputGuide
      >
        <Show when={collisions().length > 0}>
          <text fg="warning">
            Note: Some servers already exist with the same name. If selected,
            they will be imported with a numbered suffix.
          </text>
        </Show>
        <text>Please select the servers you want to import:</text>

        <SelectMulti
          options={serverNames().map(server => ({
            label: `${server}${collisions().includes(server) ? ' (already exists)' : ''}`,
            value: server,
          }))}
          defaultValue={serverNames().filter(name => !collisions().includes(name))}
          onSubmit={onSubmit}
          onCancel={handleEscCancel}
          hideIndexes
        />
      </Dialog>
      <box paddingX={1}>
        <text dimmed>
          <Byline>
            <KeyboardShortcutHint shortcut="Space" action="select" />
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
    </>
  )
}
