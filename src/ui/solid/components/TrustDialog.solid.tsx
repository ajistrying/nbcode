import { homedir } from 'os'
import { createEffect, Show, type JSXElement } from 'solid-js'
import { logEvent } from '../../../services/analytics/index.js'
import { setSessionTrustAccepted } from '../../../bootstrap/state.js'
import type { Command } from '../../../commands.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Link } from '../../../ink.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getMcpConfigsByScope } from '../../../services/mcp/config.js'
import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import {
  checkHasTrustDialogAccepted,
  saveCurrentProjectConfig,
} from '../../../utils/config.js'
import { getCwd } from '../../../utils/cwd.js'
import { getFsImplementation } from '../../../utils/fsOperations.js'
import { gracefulShutdownSync } from '../../../utils/gracefulShutdown.js'
import { Select } from '../../solid/components/CustomSelect/index.js'
import { PermissionDialog } from '../../solid/permissions/PermissionDialog.js'
import {
  getApiKeyHelperSources,
  getAwsCommandsSources,
  getBashPermissionSources,
  getDangerousEnvVarsSources,
  getGcpCommandsSources,
  getHooksSources,
  getOtelHeadersHelperSources,
} from './TrustDialog/utils.js'

type Props = {
  onDone: () => void
  commands?: Command[]
}

export function TrustDialog(props: Props): JSXElement {
  const { servers: projectServers } = getMcpConfigsByScope('project')

  const hasMcpServers = Object.keys(projectServers).length > 0
  const hooksSettingSources = getHooksSources()
  const hasHooks = hooksSettingSources.length > 0
  const bashSettingSources = getBashPermissionSources()
  const apiKeyHelperSources = getApiKeyHelperSources()
  const hasApiKeyHelper = apiKeyHelperSources.length > 0
  const awsCommandsSources = getAwsCommandsSources()
  const hasAwsCommands = awsCommandsSources.length > 0
  const gcpCommandsSources = getGcpCommandsSources()
  const hasGcpCommands = gcpCommandsSources.length > 0
  const otelHeadersHelperSources = getOtelHeadersHelperSources()
  const hasOtelHeadersHelper = otelHeadersHelperSources.length > 0
  const dangerousEnvVarsSources = getDangerousEnvVarsSources()
  const hasDangerousEnvVars = dangerousEnvVarsSources.length > 0

  const hasSlashCommandBash =
    props.commands?.some(
      (command) =>
        command.type === 'prompt' &&
        command.loadedFrom === 'commands_DEPRECATED' &&
        (command.source === 'projectSettings' ||
          command.source === 'localSettings') &&
        command.allowedTools?.some(
          (tool: string) =>
            tool === BASH_TOOL_NAME || tool.startsWith(BASH_TOOL_NAME + '('),
        ),
    ) ?? false

  const hasSkillsBash =
    props.commands?.some(
      (command) =>
        command.type === 'prompt' &&
        (command.loadedFrom === 'skills' || command.loadedFrom === 'plugin') &&
        (command.source === 'projectSettings' ||
          command.source === 'localSettings' ||
          command.source === 'plugin') &&
        command.allowedTools?.some(
          (tool: string) =>
            tool === BASH_TOOL_NAME || tool.startsWith(BASH_TOOL_NAME + '('),
        ),
    ) ?? false

  const hasAnyBashExecution =
    bashSettingSources.length > 0 || hasSlashCommandBash || hasSkillsBash

  const hasTrustDialogAccepted = checkHasTrustDialogAccepted()

  createEffect(() => {
    const isHomeDir = homedir() === getCwd()
    logEvent('tengu_trust_dialog_shown', {
      isHomeDir,
      hasMcpServers,
      hasHooks,
      hasBashExecution: hasAnyBashExecution,
      hasApiKeyHelper,
      hasAwsCommands,
      hasGcpCommands,
      hasOtelHeadersHelper,
      hasDangerousEnvVars,
    })
  })

  function onChange(value: 'enable_all' | 'exit') {
    if (value === 'exit') {
      gracefulShutdownSync(1)
      return
    }

    const isHomeDir = homedir() === getCwd()

    logEvent('tengu_trust_dialog_accept', {
      isHomeDir,
      hasMcpServers,
      hasHooks,
      hasBashExecution: hasAnyBashExecution,
      hasApiKeyHelper,
      hasAwsCommands,
      hasGcpCommands,
      hasOtelHeadersHelper,
      hasDangerousEnvVars,
    })

    if (isHomeDir) {
      setSessionTrustAccepted(true)
    } else {
      saveCurrentProjectConfig((current: any) => ({
        ...current,
        hasTrustDialogAccepted: true,
      }))
    }

    props.onDone()
  }

  const exitState = useExitOnCtrlCDWithKeybindings(() =>
    gracefulShutdownSync(1),
  )

  useKeybinding(
    'confirm:no',
    () => {
      gracefulShutdownSync(0)
    },
    { context: 'Confirmation' },
  )

  if (hasTrustDialogAccepted) {
    setTimeout(props.onDone)
    return null
  }

  return (
    <PermissionDialog
      color="warning"
      titleColor="warning"
      title="Accessing workspace:"
    >
      <box flexDirection="column" gap={1} paddingTop={1}>
        <text><b>{getFsImplementation().cwd()}</b></text>

        <text>
          Quick safety check: Is this a project you created or one you trust?
          (Like your own code, a well-known open source project, or work from
          your team). If not, take a moment to review what{"'"}s in this folder
          first.
        </text>
        <text>
          Claude Code{"'"}ll be able to read, edit, and execute files here.
        </text>

        <text dimmed>
          <Link url="https://code.claude.com/docs/en/security">
            Security guide
          </Link>
        </text>

        <Select
          options={[
            { label: 'Yes, I trust this folder', value: 'enable_all' },
            { label: 'No, exit', value: 'exit' },
          ]}
          onChange={(value: string) => onChange(value as 'enable_all' | 'exit')}
          onCancel={() => onChange('exit')}
        />

        <text dimmed>
          <Show
            when={exitState.pending}
            fallback={<>Enter to confirm · Esc to cancel</>}
          >
            Press {exitState.keyName} again to exit
          </Show>
        </text>
      </box>
    </PermissionDialog>
  )
}
