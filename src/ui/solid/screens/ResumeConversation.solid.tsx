/**
 * Session resume / picker screen — SolidJS + OpenTUI port of
 * src/screens/ResumeConversation.tsx.
 *
 * Loads conversation logs, shows LogSelector, handles session switching.
 * Supports progressive log loading and cross-project resume checks.
 */

import { feature } from 'bun:bundle'
import { dirname } from 'path'
import { createSignal, createMemo, createEffect, onMount, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useTerminalDimensions } from '../hooks.js'
import { getOriginalCwd, switchSession } from '../../../bootstrap/state.js'
import type { Command } from '../../../commands.js'
import { LogSelector } from '../../../components/LogSelector.js'
import { Spinner } from '../Spinner.solid.js'
import { restoreCostStateForSession } from '../../../cost-tracker.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from '../../../services/mcp/types.js'
import { useAppState, useSetAppState } from '../../../state/AppState.js'
import type { Tool } from '../../../Tool.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import { asSessionId } from '../../../types/ids.js'
import type { LogOption } from '../../../types/logs.js'
import type { Message } from '../../../types/message.js'
import { agenticSessionSearch } from '../../../utils/agenticSessionSearch.js'
import { renameRecordingForSession } from '../../../utils/asciicast.js'
import { updateSessionName } from '../../../utils/concurrentSessions.js'
import { loadConversationForResume } from '../../../utils/conversationRecovery.js'
import { checkCrossProjectResume } from '../../../utils/crossProjectResume.js'
import type { FileHistorySnapshot } from '../../../utils/fileHistory.js'
import { logError } from '../../../utils/log.js'
import { createSystemMessage } from '../../../utils/messages.js'
import {
  computeStandaloneAgentContext,
  restoreAgentFromSession,
  restoreWorktreeForResume,
} from '../../../utils/sessionRestore.js'
import {
  adoptResumedSessionFile,
  enrichLogs,
  isCustomTitleEnabled,
  loadAllProjectsMessageLogsProgressive,
  loadSameRepoMessageLogsProgressive,
  recordContentReplacement,
  resetSessionFilePointer,
  restoreSessionMetadata,
  type SessionLogResult,
} from '../../../utils/sessionStorage.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import type { ContentReplacementRecord } from '../../../utils/toolResultStorage.js'
import { REPL } from '../../../screens/REPL.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePrIdentifier(value: string): number | null {
  const directNumber = parseInt(value, 10)
  if (!isNaN(directNumber) && directNumber > 0) {
    return directNumber
  }
  const urlMatch = value.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)
  if (urlMatch?.[1]) {
    return parseInt(urlMatch[1], 10)
  }
  return null
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  commands: Command[]
  worktreePaths: string[]
  initialTools: Tool[]
  mcpClients?: MCPServerConnection[]
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  debug: boolean
  mainThreadAgentDefinition?: AgentDefinition
  autoConnectIdeFlag?: boolean
  strictMcpConfig?: boolean
  systemPrompt?: string
  appendSystemPrompt?: string
  initialSearchQuery?: string
  disableSlashCommands?: boolean
  forkSession?: boolean
  taskListId?: string
  filterByPr?: boolean | number | string
  thinkingConfig: ThinkingConfig
  onTurnComplete?: (messages: Message[]) => void | Promise<void>
}

type ResumeData = {
  messages: Message[]
  fileHistorySnapshots?: FileHistorySnapshot[]
  contentReplacements?: ContentReplacementRecord[]
  agentName?: string
  agentColor?: AgentColorName
  mainThreadAgentDefinition?: AgentDefinition
}

// ---------------------------------------------------------------------------
// ResumeConversation — main component
// ---------------------------------------------------------------------------

export function ResumeConversation(props: Props): JSX.Element {
  const { height: rows } = useTerminalDimensions()
  const agentDefinitions = useAppState((s) => s.agentDefinitions)
  const setAppState = useSetAppState()

  const [logs, setLogs] = createSignal<LogOption[]>([])
  const [loading, setLoading] = createSignal(true)
  const [resuming, setResuming] = createSignal(false)
  const [showAllProjects, setShowAllProjects] = createSignal(false)
  const [resumeData, setResumeData] = createSignal<ResumeData | null>(null)
  const [crossProjectCommand, setCrossProjectCommand] = createSignal<
    string | null
  >(null)

  let sessionLogResultRef: SessionLogResult | null = null
  let logCountRef = 0

  const filteredLogs = createMemo(() => {
    let result = logs().filter((l) => !l.isSidechain)
    if (props.filterByPr !== undefined) {
      if (props.filterByPr === true) {
        result = result.filter((l) => l.prNumber !== undefined)
      } else if (typeof props.filterByPr === 'number') {
        result = result.filter((l) => l.prNumber === props.filterByPr)
      } else if (typeof props.filterByPr === 'string') {
        const prNumber = parsePrIdentifier(props.filterByPr)
        if (prNumber !== null) {
          result = result.filter((l) => l.prNumber === prNumber)
        }
      }
    }
    return result
  })

  const isResumeWithRenameEnabled = isCustomTitleEnabled()

  // Initial log load
  onMount(() => {
    loadSameRepoMessageLogsProgressive(props.worktreePaths)
      .then((result) => {
        sessionLogResultRef = result
        logCountRef = result.logs.length
        setLogs(result.logs)
        setLoading(false)
      })
      .catch((error) => {
        logError(error)
        setLoading(false)
      })
  })

  const loadMoreLogs = (count: number) => {
    const ref = sessionLogResultRef
    if (!ref || ref.nextIndex >= ref.allStatLogs.length) return
    void enrichLogs(ref.allStatLogs, ref.nextIndex, count).then((result) => {
      ref.nextIndex = result.nextIndex
      if (result.logs.length > 0) {
        const offset = logCountRef
        result.logs.forEach((log, i) => {
          log.value = offset + i
        })
        setLogs((prev) => prev.concat(result.logs))
        logCountRef += result.logs.length
      } else if (ref.nextIndex < ref.allStatLogs.length) {
        loadMoreLogs(count)
      }
    })
  }

  const loadLogs = (allProjects: boolean) => {
    setLoading(true)
    const promise = allProjects
      ? loadAllProjectsMessageLogsProgressive()
      : loadSameRepoMessageLogsProgressive(props.worktreePaths)
    promise
      .then((result) => {
        sessionLogResultRef = result
        logCountRef = result.logs.length
        setLogs(result.logs)
      })
      .catch((error) => {
        logError(error)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleToggleAllProjects = () => {
    const newValue = !showAllProjects()
    setShowAllProjects(newValue)
    loadLogs(newValue)
  }

  function onCancel() {
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }

  async function onSelect(log: LogOption) {
    setResuming(true)
    const resumeStart = performance.now()

    const crossProjectCheck = checkCrossProjectResume(
      log,
      showAllProjects(),
      props.worktreePaths,
    )
    if (crossProjectCheck.isCrossProject) {
      if (!crossProjectCheck.isSameRepoWorktree) {
        const raw = await setClipboard(crossProjectCheck.command)
        if (raw) process.stdout.write(raw)
        setCrossProjectCommand(crossProjectCheck.command)
        return
      }
    }

    try {
      const result = await loadConversationForResume(log, undefined)
      if (!result) {
        throw new Error('Failed to load conversation')
      }

      if (feature('COORDINATOR_MODE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const coordinatorModule = require('../../../coordinator/coordinatorMode.js') as typeof import('../../../coordinator/coordinatorMode.js')
        /* eslint-enable @typescript-eslint/no-require-imports */
        const warning = coordinatorModule.matchSessionMode(result.mode)
        if (warning) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const {
            getAgentDefinitionsWithOverrides,
            getActiveAgentsFromList,
          } = require('../../../tools/AgentTool/loadAgentsDir.js') as typeof import('../../../tools/AgentTool/loadAgentsDir.js')
          /* eslint-enable @typescript-eslint/no-require-imports */
          getAgentDefinitionsWithOverrides.cache.clear?.()
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(
            getOriginalCwd(),
          )
          setAppState((prev) => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(
                freshAgentDefs.allAgents,
              ),
            },
          }))
          result.messages.push(createSystemMessage(warning, 'warning'))
        }
      }

      if (result.sessionId && !props.forkSession) {
        switchSession(
          asSessionId(result.sessionId),
          log.fullPath ? dirname(log.fullPath) : null,
        )
        await renameRecordingForSession()
        await resetSessionFilePointer()
        restoreCostStateForSession(result.sessionId)
      } else if (
        props.forkSession &&
        result.contentReplacements?.length
      ) {
        await recordContentReplacement(result.contentReplacements)
      }

      const { agentDefinition: resolvedAgentDef } =
        restoreAgentFromSession(
          result.agentSetting,
          props.mainThreadAgentDefinition,
          agentDefinitions,
        )
      setAppState((prev) => ({
        ...prev,
        agent: resolvedAgentDef?.agentType,
      }))

      if (feature('COORDINATOR_MODE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { saveMode } = require('../../../utils/sessionStorage.js')
        const { isCoordinatorMode } =
          require('../../../coordinator/coordinatorMode.js') as typeof import('../../../coordinator/coordinatorMode.js')
        /* eslint-enable @typescript-eslint/no-require-imports */
        saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
      }

      const standaloneAgentContext = computeStandaloneAgentContext(
        result.agentName,
        result.agentColor,
      )
      if (standaloneAgentContext) {
        setAppState((prev) => ({
          ...prev,
          standaloneAgentContext,
        }))
      }

      void updateSessionName(result.agentName)

      restoreSessionMetadata(
        props.forkSession
          ? { ...result, worktreeSession: undefined }
          : result,
      )

      if (!props.forkSession) {
        restoreWorktreeForResume(result.worktreeSession)
        if (result.sessionId) {
          adoptResumedSessionFile()
        }
      }

      if (feature('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        ;(
          require('../../../services/contextCollapse/persist.js') as typeof import('../../../services/contextCollapse/persist.js')
        ).restoreFromEntries(
          result.contextCollapseCommits ?? [],
          result.contextCollapseSnapshot,
        )
        /* eslint-enable @typescript-eslint/no-require-imports */
      }

      logEvent('tengu_session_resumed', {
        entrypoint:
          'picker' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
        resume_duration_ms: Math.round(
          performance.now() - resumeStart,
        ),
      })

      setLogs([])
      setResumeData({
        messages: result.messages,
        fileHistorySnapshots: result.fileHistorySnapshots,
        contentReplacements: result.contentReplacements,
        agentName: result.agentName,
        agentColor: (result.agentColor === 'default'
          ? undefined
          : result.agentColor) as AgentColorName | undefined,
        mainThreadAgentDefinition: resolvedAgentDef,
      })
    } catch (e) {
      logEvent('tengu_session_resumed', {
        entrypoint:
          'picker' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: false,
      })
      logError(e as Error)
      throw e
    }
  }

  return (
    <>
      <Show when={crossProjectCommand()}>
        {(cmd) => <CrossProjectMessage command={cmd()} />}
      </Show>

      <Show when={!crossProjectCommand() && resumeData()}>
        {(data) => (
          <REPL
            debug={props.debug}
            commands={props.commands}
            initialTools={props.initialTools}
            initialMessages={data().messages}
            initialFileHistorySnapshots={data().fileHistorySnapshots}
            initialContentReplacements={data().contentReplacements}
            initialAgentName={data().agentName}
            initialAgentColor={data().agentColor}
            mcpClients={props.mcpClients}
            dynamicMcpConfig={props.dynamicMcpConfig}
            strictMcpConfig={props.strictMcpConfig ?? false}
            systemPrompt={props.systemPrompt}
            appendSystemPrompt={props.appendSystemPrompt}
            mainThreadAgentDefinition={data().mainThreadAgentDefinition}
            autoConnectIdeFlag={props.autoConnectIdeFlag}
            disableSlashCommands={props.disableSlashCommands ?? false}
            taskListId={props.taskListId}
            thinkingConfig={props.thinkingConfig}
            onTurnComplete={props.onTurnComplete}
          />
        )}
      </Show>

      <Show when={!crossProjectCommand() && !resumeData() && loading()}>
        <box>
          <Spinner />
          <text> Loading conversations{'\u2026'}</text>
        </box>
      </Show>

      <Show
        when={
          !crossProjectCommand() &&
          !resumeData() &&
          !loading() &&
          resuming()
        }
      >
        <box>
          <Spinner />
          <text> Resuming conversation{'\u2026'}</text>
        </box>
      </Show>

      <Show
        when={
          !crossProjectCommand() &&
          !resumeData() &&
          !loading() &&
          !resuming() &&
          filteredLogs().length === 0
        }
      >
        <NoConversationsMessage />
      </Show>

      <Show
        when={
          !crossProjectCommand() &&
          !resumeData() &&
          !loading() &&
          !resuming() &&
          filteredLogs().length > 0
        }
      >
        <LogSelector
          logs={filteredLogs()}
          maxHeight={rows}
          onCancel={onCancel}
          onSelect={onSelect}
          onLogsChanged={
            isResumeWithRenameEnabled
              ? () => loadLogs(showAllProjects())
              : undefined
          }
          onLoadMore={loadMoreLogs}
          initialSearchQuery={props.initialSearchQuery}
          showAllProjects={showAllProjects()}
          onToggleAllProjects={handleToggleAllProjects}
          onAgenticSearch={agenticSessionSearch}
        />
      </Show>
    </>
  )
}

// ---------------------------------------------------------------------------
// NoConversationsMessage
// ---------------------------------------------------------------------------

function NoConversationsMessage(): JSX.Element {
  useKeybinding(
    'app:interrupt',
    () => {
      process.exit(1)
    },
    { context: 'Global' },
  )

  return (
    <box flexDirection="column">
      <text>No conversations found to resume.</text>
      <text dimmed>Press Ctrl+C to exit and start a new conversation.</text>
    </box>
  )
}

// ---------------------------------------------------------------------------
// CrossProjectMessage
// ---------------------------------------------------------------------------

function CrossProjectMessage(props: { command: string }): JSX.Element {
  onMount(() => {
    const timeout = setTimeout(() => {
      process.exit(0)
    }, 100)
    // cleanup not strictly needed but good practice
    return () => clearTimeout(timeout)
  })

  return (
    <box flexDirection="column" gap={1}>
      <text>This conversation is from a different directory.</text>
      <box flexDirection="column">
        <text>To resume, run:</text>
        <text> {props.command}</text>
      </box>
      <text dimmed>(Command copied to clipboard)</text>
    </box>
  )
}
