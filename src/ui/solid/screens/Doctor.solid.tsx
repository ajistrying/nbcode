/**
 * System diagnostics screen — SolidJS + OpenTUI port of
 * src/screens/Doctor.tsx.
 *
 * Checks model config, settings, tools, MCP servers, keybindings, etc.
 */

import figures from 'figures'
import { join } from 'path'
import { createSignal, createEffect, createMemo, onMount, Show, For, createResource } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { KeybindingWarnings } from '../components/KeybindingWarnings.solid.js'
import { McpParsingWarnings } from '../../../components/mcp/McpParsingWarnings.js'
import { getModelMaxOutputTokens } from '../../../utils/context.js'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import type { SettingSource } from '../../../utils/settings/constants.js'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { Pane } from '../design-system/Pane.solid.js'
import { PressEnterToContinue } from '../components/PressEnterToContinue.solid.js'
import { SandboxDoctorSection } from '../../../components/sandbox/SandboxDoctorSection.js'
import { ValidationErrorsList } from '../components/ValidationErrorsList.solid.js'
import { useSettingsErrors } from '../../../hooks/notifs/useSettingsErrors.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import { useAppState } from '../../../state/AppState.js'
import { getPluginErrorMessage } from '../../../types/plugin.js'
import { getGcsDistTags, getNpmDistTags, type NpmDistTags } from '../../../utils/autoUpdater.js'
import { type ContextWarnings, checkContextWarnings } from '../../../utils/doctorContextWarnings.js'
import { type DiagnosticInfo, getDoctorDiagnostic } from '../../../utils/doctorDiagnostic.js'
import { validateBoundedIntEnvVar } from '../../../utils/envValidation.js'
import { pathExists } from '../../../utils/file.js'
import {
  cleanupStaleLocks,
  getAllLockInfo,
  isPidBasedLockingEnabled,
  type LockInfo,
} from '../../../utils/nativeInstaller/pidLock.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'
import {
  BASH_MAX_OUTPUT_DEFAULT,
  BASH_MAX_OUTPUT_UPPER_LIMIT,
} from '../../../utils/shell/outputLimits.js'
import {
  TASK_MAX_OUTPUT_DEFAULT,
  TASK_MAX_OUTPUT_UPPER_LIMIT,
} from '../../../utils/task/outputFormatting.js'
import { getXDGStateHome } from '../../../utils/xdg.js'

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type AgentInfo = {
  activeAgents: Array<{
    agentType: string
    source: SettingSource | 'built-in' | 'plugin'
  }>
  userAgentsDir: string
  projectAgentsDir: string
  userDirExists: boolean
  projectDirExists: boolean
  failedFiles?: Array<{ path: string; error: string }>
}

type VersionLockInfo = {
  enabled: boolean
  locks: LockInfo[]
  locksDir: string
  staleLocksCleaned: number
}

// ---------------------------------------------------------------------------
// DistTagsDisplay — async sub-component using createResource
// ---------------------------------------------------------------------------

function DistTagsDisplay(props: { promise: Promise<NpmDistTags> }): JSX.Element {
  const [distTags] = createResource(
    () => props.promise,
    (p) => p,
  )

  return (
    <Show when={distTags()} fallback={null as unknown as JSX.Element}>
      {(tags) => (
        <Show
          when={tags().latest}
          fallback={<text dimmed>{'└'} Failed to fetch versions</text>}
        >
          <>
            <Show when={tags().stable}>
              <text>{'└'} Stable version: {tags().stable}</text>
            </Show>
            <text>{'└'} Latest version: {tags().latest}</text>
          </>
        </Show>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// Doctor — main component
// ---------------------------------------------------------------------------

export function Doctor(props: Props): JSX.Element {
  const agentDefinitions = useAppState((s) => s.agentDefinitions)
  const mcpTools = useAppState((s) => s.mcp.tools)
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext)
  const pluginsErrors = useAppState((s) => s.plugins.errors)

  useExitOnCtrlCDWithKeybindings()

  const tools = createMemo(() => mcpTools || [])

  const [diagnostic, setDiagnostic] = createSignal<DiagnosticInfo | null>(null)
  const [agentInfo, setAgentInfo] = createSignal<AgentInfo | null>(null)
  const [contextWarnings, setContextWarnings] = createSignal<ContextWarnings | null>(null)
  const [versionLockInfo, setVersionLockInfo] = createSignal<VersionLockInfo | null>(null)

  const validationErrors = useSettingsErrors()

  // Fetch dist tags once
  const distTagsPromise = getDoctorDiagnostic().then((diag) => {
    const fetchDistTags =
      diag.installationType === 'native' ? getGcsDistTags : getNpmDistTags
    return fetchDistTags().catch(
      (): NpmDistTags => ({ latest: null, stable: null }),
    )
  })

  const autoUpdatesChannel =
    getInitialSettings()?.autoUpdatesChannel ?? 'latest'

  const errorsExcludingMcp = createMemo(() =>
    validationErrors.filter(
      (error: { mcpErrorMetadata?: unknown }) => error.mcpErrorMetadata === undefined,
    ),
  )

  // Environment variable validation (computed once)
  const envValidationErrors = (() => {
    const envVars = [
      {
        name: 'BASH_MAX_OUTPUT_LENGTH',
        default: BASH_MAX_OUTPUT_DEFAULT,
        upperLimit: BASH_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'TASK_MAX_OUTPUT_LENGTH',
        default: TASK_MAX_OUTPUT_DEFAULT,
        upperLimit: TASK_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        ...getModelMaxOutputTokens('claude-opus-4-6'),
      },
    ]
    return envVars
      .map((v) => {
        const value = process.env[v.name]
        const result = validateBoundedIntEnvVar(
          v.name,
          value,
          v.default,
          v.upperLimit,
        )
        return { name: v.name, ...result }
      })
      .filter((v) => v.status !== 'valid')
  })()

  // Load diagnostics, agent info, context warnings, and version locks
  createEffect(() => {
    // Track reactive deps
    const _tools = tools()
    const _toolPermCtx = toolPermissionContext
    const _agentDefs = agentDefinitions

    getDoctorDiagnostic().then(setDiagnostic)
    ;(async () => {
      const userAgentsDir = join(getClaudeConfigHomeDir(), 'agents')
      const projectAgentsDir = join(getOriginalCwd(), '.claude', 'agents')
      const { activeAgents, allAgents, failedFiles } = _agentDefs
      const [userDirExists, projectDirExists] = await Promise.all([
        pathExists(userAgentsDir),
        pathExists(projectAgentsDir),
      ])
      const agentInfoData: AgentInfo = {
        activeAgents: activeAgents.map((a: { agentType: string; source: SettingSource | 'built-in' | 'plugin' }) => ({
          agentType: a.agentType,
          source: a.source,
        })),
        userAgentsDir,
        projectAgentsDir,
        userDirExists,
        projectDirExists,
        failedFiles,
      }
      setAgentInfo(agentInfoData)

      const warnings = await checkContextWarnings(
        _tools,
        { activeAgents, allAgents, failedFiles },
        async () => _toolPermCtx,
      )
      setContextWarnings(warnings)

      if (isPidBasedLockingEnabled()) {
        const locksDir = join(getXDGStateHome(), 'claude', 'locks')
        const staleLocksCleaned = cleanupStaleLocks(locksDir)
        const locks = getAllLockInfo(locksDir)
        setVersionLockInfo({
          enabled: true,
          locks,
          locksDir,
          staleLocksCleaned,
        })
      } else {
        setVersionLockInfo({
          enabled: false,
          locks: [],
          locksDir: '',
          staleLocksCleaned: 0,
        })
      }
    })()
  })

  const handleDismiss = () => {
    props.onDone('Claude Code diagnostics dismissed', { display: 'system' })
  }

  useKeybindings(
    {
      'confirm:yes': handleDismiss,
      'confirm:no': handleDismiss,
    },
    { context: 'Confirmation' },
  )

  return (
    <Show
      when={diagnostic()}
      fallback={
        <Pane>
          <text dimmed>Checking installation status{'\u2026'}</text>
        </Pane>
      }
    >
      {(diag) => {
        const ripgrepStatus = () =>
          diag().ripgrepStatus.working ? 'OK' : 'Not working'
        const ripgrepMode = () =>
          diag().ripgrepStatus.mode === 'embedded'
            ? 'bundled'
            : diag().ripgrepStatus.mode === 'builtin'
              ? 'vendor'
              : diag().ripgrepStatus.systemPath || 'system'
        const autoUpdatesLabel = () =>
          diag().packageManager
            ? 'Managed by package manager'
            : diag().autoUpdates

        return (
          <Pane>
            {/* ---- Installation ---- */}
            <box flexDirection="column">
              <text><b>Diagnostics</b></text>
              <text>
                {'└'} Currently running: {diag().installationType} (
                {diag().version})
              </text>
              <Show when={diag().packageManager}>
                <text>{'└'} Package manager: {diag().packageManager}</text>
              </Show>
              <text>{'└'} Path: {diag().installationPath}</text>
              <text>{'└'} Invoked: {diag().invokedBinary}</text>
              <text>
                {'└'} Config install method: {diag().configInstallMethod}
              </text>
              <text>
                {'└'} Search: {ripgrepStatus()} ({ripgrepMode()})
              </text>

              <Show when={diag().recommendation}>
                <>
                  <text />
                  <text fg="warning">
                    Recommendation: {diag().recommendation!.split('\n')[0]}
                  </text>
                  <text dimmed>
                    {diag().recommendation!.split('\n')[1]}
                  </text>
                </>
              </Show>

              <Show when={diag().multipleInstallations.length > 1}>
                <>
                  <text />
                  <text fg="warning">
                    Warning: Multiple installations found
                  </text>
                  <For each={diag().multipleInstallations}>
                    {(install, i) => (
                      <text>
                        {'└'} {install.type} at {install.path}
                      </text>
                    )}
                  </For>
                </>
              </Show>

              <Show when={diag().warnings.length > 0}>
                <>
                  <text />
                  <For each={diag().warnings}>
                    {(warning, i) => (
                      <box flexDirection="column">
                        <text fg="warning">Warning: {warning.issue}</text>
                        <text>Fix: {warning.fix}</text>
                      </box>
                    )}
                  </For>
                </>
              </Show>

              <Show when={errorsExcludingMcp().length > 0}>
                <box flexDirection="column" marginTop={1} marginBottom={1}>
                  <text><b>Invalid Settings</b></text>
                  <ValidationErrorsList errors={errorsExcludingMcp()} />
                </box>
              </Show>
            </box>

            {/* ---- Updates ---- */}
            <box flexDirection="column">
              <text><b>Updates</b></text>
              <text>
                {'└'} Auto-updates: {autoUpdatesLabel()}
              </text>
              <Show when={diag().hasUpdatePermissions !== null}>
                <text>
                  {'└'} Update permissions:{' '}
                  {diag().hasUpdatePermissions
                    ? 'Yes'
                    : 'No (requires sudo)'}
                </text>
              </Show>
              <text>{'└'} Auto-update channel: {autoUpdatesChannel}</text>
              <DistTagsDisplay promise={distTagsPromise} />
            </box>

            {/* ---- Static sections ---- */}
            <SandboxDoctorSection />
            <McpParsingWarnings />
            <KeybindingWarnings />

            {/* ---- Environment Variables ---- */}
            <Show when={envValidationErrors.length > 0}>
              <box flexDirection="column">
                <text><b>Environment Variables</b></text>
                <For each={envValidationErrors}>
                  {(validation) => (
                    <text>
                      {'└'} {validation.name}:{' '}
                      <text
                        fg={
                          validation.status === 'capped'
                            ? 'warning'
                            : 'error'
                        }
                      >
                        {validation.message}
                      </text>
                    </text>
                  )}
                </For>
              </box>
            </Show>

            {/* ---- Version Locks ---- */}
            <Show when={versionLockInfo()?.enabled}>
              <box flexDirection="column">
                <text><b>Version Locks</b></text>
                <Show when={versionLockInfo()!.staleLocksCleaned > 0}>
                  <text dimmed>
                    {'└'} Cleaned {versionLockInfo()!.staleLocksCleaned}{' '}
                    stale lock(s)
                  </text>
                </Show>
                <Show
                  when={versionLockInfo()!.locks.length > 0}
                  fallback={
                    <text dimmed>{'└'} No active version locks</text>
                  }
                >
                  <For each={versionLockInfo()!.locks}>
                    {(lock) => (
                      <text>
                        {'└'} {lock.version}: PID {lock.pid}{' '}
                        <Show
                          when={lock.isProcessRunning}
                          fallback={<text fg="warning">(stale)</text>}
                        >
                          <text>(running)</text>
                        </Show>
                      </text>
                    )}
                  </For>
                </Show>
              </box>
            </Show>

            {/* ---- Agent Parse Errors ---- */}
            <Show
              when={
                agentInfo()?.failedFiles &&
                agentInfo()!.failedFiles!.length > 0
              }
            >
              <box flexDirection="column">
                <text fg="error"><b>Agent Parse Errors</b></text>
                <text fg="error">
                  {'└'} Failed to parse{' '}
                  {agentInfo()!.failedFiles!.length} agent file(s):
                </text>
                <For each={agentInfo()!.failedFiles!}>
                  {(file) => (
                    <text dimmed>
                      {'  └'} {file.path}: {file.error}
                    </text>
                  )}
                </For>
              </box>
            </Show>

            {/* ---- Plugin Errors ---- */}
            <Show when={pluginsErrors.length > 0}>
              <box flexDirection="column">
                <text fg="error"><b>Plugin Errors</b></text>
                <text fg="error">
                  {'└'} {pluginsErrors.length} plugin error(s) detected:
                </text>
                <For each={pluginsErrors}>
                  {(error) => (
                    <text dimmed>
                      {'  └'}{' '}
                      {(error as any).source || 'unknown'}
                      {'plugin' in error && (error as any).plugin
                        ? ` [${(error as any).plugin}]`
                        : ''}
                      : {getPluginErrorMessage(error)}
                    </text>
                  )}
                </For>
              </box>
            </Show>

            {/* ---- Unreachable Permission Rules ---- */}
            <Show when={contextWarnings()?.unreachableRulesWarning}>
              <box flexDirection="column">
                <text fg="warning">
                  <b>Unreachable Permission Rules</b>
                </text>
                <text>
                  {'└'}{' '}
                  <text fg="warning">
                    {figures.warning}{' '}
                    {contextWarnings()!.unreachableRulesWarning!.message}
                  </text>
                </text>
                <For
                  each={
                    contextWarnings()!.unreachableRulesWarning!.details
                  }
                >
                  {(detail) => (
                    <text dimmed>{'  └'} {detail}</text>
                  )}
                </For>
              </box>
            </Show>

            {/* ---- Context Usage Warnings ---- */}
            <Show
              when={
                contextWarnings() &&
                (contextWarnings()!.claudeMdWarning ||
                  contextWarnings()!.agentWarning ||
                  contextWarnings()!.mcpWarning)
              }
            >
              <box flexDirection="column">
                <text><b>Context Usage Warnings</b></text>

                <Show when={contextWarnings()?.claudeMdWarning}>
                  <>
                    <text>
                      {'└'}{' '}
                      <text fg="warning">
                        {figures.warning}{' '}
                        {contextWarnings()!.claudeMdWarning!.message}
                      </text>
                    </text>
                    <text>{'  └'} Files:</text>
                    <For
                      each={
                        contextWarnings()!.claudeMdWarning!.details
                      }
                    >
                      {(detail) => (
                        <text dimmed>{'    └'} {detail}</text>
                      )}
                    </For>
                  </>
                </Show>

                <Show when={contextWarnings()?.agentWarning}>
                  <>
                    <text>
                      {'└'}{' '}
                      <text fg="warning">
                        {figures.warning}{' '}
                        {contextWarnings()!.agentWarning!.message}
                      </text>
                    </text>
                    <text>{'  └'} Top contributors:</text>
                    <For
                      each={
                        contextWarnings()!.agentWarning!.details
                      }
                    >
                      {(detail) => (
                        <text dimmed>{'    └'} {detail}</text>
                      )}
                    </For>
                  </>
                </Show>

                <Show when={contextWarnings()?.mcpWarning}>
                  <>
                    <text>
                      {'└'}{' '}
                      <text fg="warning">
                        {figures.warning}{' '}
                        {contextWarnings()!.mcpWarning!.message}
                      </text>
                    </text>
                    <text>{'  └'} MCP servers:</text>
                    <For
                      each={contextWarnings()!.mcpWarning!.details}
                    >
                      {(detail) => (
                        <text dimmed>{'    └'} {detail}</text>
                      )}
                    </For>
                  </>
                </Show>
              </box>
            </Show>

            {/* ---- Footer ---- */}
            <box>
              <PressEnterToContinue />
            </box>
          </Pane>
        )
      }}
    </Show>
  )
}
