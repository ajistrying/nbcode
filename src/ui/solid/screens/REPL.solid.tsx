/**
 * REPL.solid.tsx — SolidJS + OpenTUI port of the main REPL screen.
 *
 * This is the root orchestrator for the entire CLI application. It manages:
 * - Conversation state (messages, streaming, loading)
 * - Query execution loop (the core async function calling the API)
 * - Tool confirmation / permission dialogs
 * - Dialog presentation (cost, idle-return, elicitation, onboarding)
 * - Keyboard input and screen mode switching (prompt vs transcript)
 * - Session management (resume, backgrounding, worktrees)
 *
 * Ported from src/screens/REPL.tsx (5,002 lines React+Ink) to ~1,800 lines
 * SolidJS+OpenTUI by stripping the React Compiler runtime (_c(), $[] cache
 * arrays), replacing ~50 useCallback with plain functions, ~20 useState with
 * createSignal, ~10 useMemo with createMemo, ~30 useRef with let variables,
 * and removing useDeferredValue (Solid is already granular).
 *
 * Sub-components (PermissionRequest, ElicitationDialog, PromptInput, Messages,
 * etc.) have already been ported in src/ui/solid/. The actual wiring to those
 * components happens in a later integration pass.
 */

// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import { spawnSync } from 'child_process'
import {
  snapshotOutputTokensForTurn,
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  getBudgetContinuationCount,
  getTotalInputTokens,
} from '../../../bootstrap/state.js'
import { parseTokenBudget } from '../../../utils/tokenBudget.js'
import { count } from '../../../utils/array.js'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import figures from 'figures'
import { renderMessagesToPlainText } from '../../../utils/exportRenderer.js'
import { openFileInExternalEditor } from '../../../utils/editor.js'
import { writeFile } from 'fs/promises'
import type { TabStatusKind } from '../../../ink/hooks/use-tab-status.js'
import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  type JSX,
} from 'solid-js'
import type { JumpHandle } from '../../../components/VirtualMessageList.js'
import type { MCPServerConnection } from '../../../services/mcp/types.js'
import type { ScopedMcpServerConfig } from '../../../services/mcp/types.js'
import { randomUUID, type UUID } from 'crypto'
import type {
  Message as MessageType,
  UserMessage,
  ProgressMessage,
  HookResultMessage,
  PartialCompactDirection,
} from '../../../types/message.js'
import type { PromptInputMode, QueuedCommand, VimMode } from '../../../types/textInputTypes.js'
import type { ToolPermissionContext, Tool } from '../../../Tool.js'
import type { ContentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ProcessUserInputContext } from '../../../utils/processUserInput/processUserInput.js'
import type { PastedContent } from '../../../utils/config.js'
import type { LogOption } from '../../../types/logs.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { FileHistoryState, FileHistorySnapshot } from '../../../utils/fileHistory.js'
import type { AttributionState } from '../../../utils/commitAttribution.js'
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import type { EffortValue } from '../../../utils/effort.js'
import type { Theme } from '../../../utils/theme.js'
import type { StreamingToolUse, StreamingThinking } from '../../../utils/messages.js'
import type { SpinnerMode } from '../../../components/Spinner.js'
import type { PromptRequest, PromptResponse, HookProgress } from '../../../types/hooks.js'
import type { IDESelection } from '../../../hooks/useIdeSelection.js'
import type { IdeType, IDEExtensionInstallationStatus } from '../../../utils/ide.js'
import type { RemoteSessionConfig } from '../../../remote/RemoteSessionManager.js'
import type { RemoteMessageContent } from '../../../utils/teleport/api.js'
import type { DirectConnectConfig } from '../../../server/directConnectManager.js'
import type { SSHSession } from '../../../ssh/createSSHSession.js'
import type { ScrollBoxHandle } from '../../../ink/components/ScrollBox.js'
import type {
  Command,
  CommandResultDisplay,
  ResumeEntrypoint,
} from '../../../commands.js'
import type { ToolUseConfirm } from '../../../components/permissions/PermissionRequest.js'
import type { NetworkHostPattern, SandboxAskCallback } from '../../../utils/sandbox/sandbox-adapter.js'
import type { ContentReplacementRecord } from '../../../utils/toolResultStorage.js'
import type { ActiveSpeculationState } from '../../../services/PromptSuggestion/speculation.js'
import type { SetAppState } from '../../../utils/messageQueueManager.js'
import type { PromptInputHelpers } from '../../../utils/handlePromptSubmit.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { AutoRunIssueReason } from '../../../utils/autoRunIssue.js'
import type {
  MessageActionsState,
  MessageActionsNav,
  MessageActionCaps,
} from '../../../components/messageActions.js'

import { isEnvTruthy } from '../../../utils/envUtils.js'
import { formatTokens, truncateToWidth } from '../../../utils/format.js'
import { consumeEarlyInput } from '../../../utils/earlyInput.js'
import { logForDebugging } from '../../../utils/debug.js'
import { QueryGuard } from '../../../utils/QueryGuard.js'
import { errorMessage } from '../../../utils/errors.js'
import { isHumanTurn } from '../../../utils/messagePredicates.js'
import { logError } from '../../../utils/log.js'
import { createAbortController } from '../../../utils/abortController.js'
import { isFullscreenEnvEnabled, isMouseTrackingEnabled } from '../../../utils/fullscreen.js'
import { getGlobalConfig, saveGlobalConfig, getGlobalConfigWriteCount } from '../../../utils/config.js'
import { hasConsoleBillingAccess } from '../../../utils/billing.js'
import { logEvent, type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../../services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  textForResubmit,
  handleMessageFromStream,
  isCompactBoundaryMessage,
  getMessagesAfterCompactBoundary,
  getContentText,
  createUserMessage,
  createAssistantMessage,
  createTurnDurationMessage,
  createAgentsKilledMessage,
  createApiMetricsMessage,
  createSystemMessage,
  createCommandInputMessage,
  formatCommandInputTags,
} from '../../../utils/messages.js'
import { gracefulShutdownSync } from '../../../utils/gracefulShutdown.js'
import { handlePromptSubmit } from '../../../utils/handlePromptSubmit.js'
import { query } from '../../../query.js'
import { getQuerySourceForREPL } from '../../../utils/promptCategory.js'
import { getSystemPrompt } from '../../../constants/prompts.js'
import { buildEffectiveSystemPrompt } from '../../../utils/systemPrompt.js'
import { getSystemContext, getUserContext } from '../../../context.js'
import { getMemoryFiles } from '../../../utils/claudemd.js'
import { startBackgroundHousekeeping } from '../../../utils/backgroundHousekeeping.js'
import {
  getTotalCost,
  saveCurrentSessionCosts,
  resetCostState,
  getStoredSessionCosts,
} from '../../../cost-tracker.js'
import { addToHistory, removeLastFromHistory, expandPastedTextRefs, parseReferences } from '../../../history.js'
import { prependModeCharacterToInput } from '../../../components/PromptInput/inputModes.js'
import { prependToShellHistoryCache } from '../../../utils/suggestions/shellHistoryCompletion.js'
import {
  updateLastInteractionTime,
  getLastInteractionTime,
  getOriginalCwd,
  getProjectRoot,
  getSessionId,
  switchSession,
  setCostStateForRestore,
  getTurnHookDurationMs,
  getTurnHookCount,
  resetTurnHookDuration,
  getTurnToolDurationMs,
  getTurnToolCount,
  resetTurnToolDuration,
  getTurnClassifierDurationMs,
  getTurnClassifierCount,
  resetTurnClassifierDuration,
} from '../../../bootstrap/state.js'
import { asSessionId, asAgentId } from '../../../types/ids.js'
import { sendNotification } from '../../../services/notifier.js'
import { startPreventSleep, stopPreventSleep } from '../../../services/preventSleep.js'
import { endInteractionSpan } from '../../../utils/telemetry/sessionTracing.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
} from '../../../utils/fileStateCache.js'
import { clearSpeculativeChecks } from '../../../tools/BashTool/bashPermissions.js'
import { activityManager } from '../../../utils/activityManager.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import {
  clearSessionMetadata,
  resetSessionFilePointer,
  adoptResumedSessionFile,
  removeTranscriptMessage,
  restoreSessionMetadata,
  getCurrentSessionTitle,
  isEphemeralToolProgress,
  isLoggableMessage,
  saveWorktreeState,
  getAgentTranscript,
} from '../../../utils/sessionStorage.js'
import {
  popAllEditable,
  enqueue,
  getCommandQueue,
  getCommandQueueLength,
  removeByFilter,
} from '../../../utils/messageQueueManager.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import {
  isSwarmWorker,
  generateSandboxRequestId,
  sendSandboxPermissionRequestViaMailbox,
  sendSandboxPermissionResponseViaMailbox,
} from '../../../utils/swarm/permissionSync.js'
import { registerSandboxPermissionCallback } from '../../../hooks/useSwarmPermissionPoller.js'
import { getTeamName, getAgentName } from '../../../utils/teammate.js'
import { setMemberActive } from '../../../utils/swarm/teamHelpers.js'
import { injectUserMessageToTeammate, getAllInProcessTeammateTasks } from '../../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import {
  isLocalAgentTask,
  queuePendingMessage,
  appendMessageToLocalAgent,
} from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  registerLeaderToolUseConfirmQueue,
  unregisterLeaderToolUseConfirmQueue,
  registerLeaderSetToolPermissionContext,
  unregisterLeaderSetToolPermissionContext,
} from '../../../utils/swarm/leaderPermissionBridge.js'
import { deserializeMessages } from '../../../utils/conversationRecovery.js'
import { extractReadFilesFromMessages, extractBashToolsFromMessages } from '../../../utils/queryHelpers.js'
import { resetMicrocompactState } from '../../../services/compact/microCompact.js'
import { runPostCompactCleanup } from '../../../services/compact/postCompactCleanup.js'
import {
  provisionContentReplacementState,
  reconstructContentReplacementState,
} from '../../../utils/toolResultStorage.js'
import { partialCompactConversation } from '../../../services/compact/compact.js'
import { fileHistoryMakeSnapshot, fileHistoryRewind, copyFileHistoryForResume, fileHistoryEnabled, fileHistoryHasAnyChanges } from '../../../utils/fileHistory.js'
import { incrementPromptCount } from '../../../utils/commitAttribution.js'
import { recordAttributionSnapshot } from '../../../utils/sessionStorage.js'
import { computeStandaloneAgentContext, restoreAgentFromSession, restoreSessionStateFromLog, restoreWorktreeForResume, exitRestoredWorktree } from '../../../utils/sessionRestore.js'
import { isBgSession, updateSessionName, updateSessionActivity } from '../../../utils/concurrentSessions.js'
import { isInProcessTeammateTask } from '../../../tasks/InProcessTeammateTask/types.js'
import { restoreRemoteAgentTasks } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { getCurrentWorktreeSession } from '../../../utils/worktree.js'
import { getShortcutDisplay } from '../../../keybindings/shortcutFormat.js'
import { selectableUserMessagesFilter, messagesAfterAreOnlySynthetic } from '../../../components/MessageSelector.js'
import { getCommandName, isCommandEnabled, REMOTE_SAFE_COMMANDS } from '../../../commands.js'
import { parseSlashCommand } from '../../../services/keybindings/keyHandler.js'
import { dequeueHead } from '../../../services/permissions/permissionHandler.js'
import { shouldShowPlaceholder } from '../../../services/sessions/sessionHandler.js'
import { BASH_INPUT_TAG, COMMAND_MESSAGE_TAG, COMMAND_NAME_TAG, LOCAL_COMMAND_STDOUT_TAG } from '../../../constants/xml.js'
import { escapeXml } from '../../../utils/xml.js'
import { generateSessionTitle } from '../../../utils/sessionTitle.js'
import { handleSpeculationAccept } from '../../../services/PromptSuggestion/speculation.js'
import { copyPlanForFork, copyPlanForResume, getPlanSlug, setPlanSlug } from '../../../utils/plans.js'
import { applyPermissionUpdate, applyPermissionUpdates, persistPermissionUpdate } from '../../../utils/permissions/PermissionUpdate.js'
import { buildPermissionUpdates } from '../../../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import { stripDangerousPermissionsForAutoMode } from '../../../utils/permissions/permissionSetup.js'
import { getScratchpadDir, isScratchpadEnabled } from '../../../utils/permissions/filesystem.js'
import { WEB_FETCH_TOOL_NAME } from '../../../tools/WebFetchTool/prompt.js'
import { SLEEP_TOOL_NAME } from '../../../tools/SleepTool/prompt.js'
import { SANDBOX_NETWORK_ACCESS_TOOL_NAME } from '../../../cli/structuredIO.js'
import { mergeClients } from '../../../hooks/useMergedClients.js'
import { mergeAndFilterTools } from '../../../utils/toolPool.js'
import { getTools, assembleToolPool } from '../../../tools.js'
import { resolveAgentTools } from '../../../tools/AgentTool/agentToolUtils.js'
import { resumeAgentBackground } from '../../../tools/AgentTool/resumeAgent.js'
import { diagnosticTracker } from '../../../services/diagnosticTracking.js'
import { closeOpenDiffs, getConnectedIdeClient } from '../../../utils/ide.js'
import { queryCheckpoint, logQueryProfileReport } from '../../../utils/queryProfiler.js'
import { processSessionStartHooks } from '../../../utils/sessionStart.js'
import { executeSessionEndHooks, getSessionEndHookTimeoutMs } from '../../../utils/hooks.js'
import { createAttachmentMessage, getQueuedCommandAttachments } from '../../../utils/attachments.js'
import { startBackgroundSession } from '../../../tasks/LocalMainSessionTask.js'
import { getTipToShowOnSpinner, recordShownTip } from '../../../services/tips/tipScheduler.js'
import { shouldShowEffortCallout } from '../../../components/EffortCallout.js'
import { shouldShowDesktopUpsellStartup } from '../../../components/DesktopUpsell/DesktopUpsellStartup.js'
import { performStartupChecks } from '../../../utils/plugins/performStartupChecks.js'
import { computeUnseenDivider } from '../../../components/FullscreenLayout.js'
import { maybeMarkProjectOnboardingComplete } from '../../../projectOnboardingState.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { hasCursorUpViewportYankBug } from '../../../ink/terminal.js'
import { AUTO_MODE_DESCRIPTION } from '../../../components/AutoModeOptInDialog.js'
import { MIN_COLS_FOR_FULL_SPRITE } from '../../../buddy/CompanionSprite.js'
import { maybeGetTmuxMouseHint } from '../../../utils/fullscreen.js'

// ── Dead code elimination: conditional imports ──────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => Record<string, string> = feature('COORDINATOR_MODE')
  ? require('../../../coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({})

const proactiveModule = feature('PROACTIVE') || feature('KAIROS')
  ? require('../../../proactive/index.js')
  : null
const PROACTIVE_FALSE = () => false
const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false

const shouldShowAntModelSwitch =
  'external' === 'ant'
    ? require('../../../components/AntModelSwitchCallout.js').shouldShowModelSwitchCallout
    : (): boolean => false
/* eslint-enable @typescript-eslint/no-require-imports */

// ── Stable constants ────────────────────────────────────────────────
const EMPTY_MCP_CLIENTS: MCPServerConnection[] = []
const RECENT_SCROLL_REPIN_WINDOW_MS = 3000
const PROMPT_SUPPRESSION_MS = 1500

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!
}

// ── Types ───────────────────────────────────────────────────────────
export type Props = {
  commands: Command[]
  debug: boolean
  initialTools: Tool[]
  initialMessages?: MessageType[]
  pendingHookMessages?: Promise<HookResultMessage[]>
  initialFileHistorySnapshots?: FileHistorySnapshot[]
  initialContentReplacements?: ContentReplacementRecord[]
  initialAgentName?: string
  initialAgentColor?: AgentColorName
  mcpClients?: MCPServerConnection[]
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  autoConnectIdeFlag?: boolean
  strictMcpConfig?: boolean
  systemPrompt?: string
  appendSystemPrompt?: string
  onBeforeQuery?: (input: string, newMessages: MessageType[]) => Promise<boolean>
  onTurnComplete?: (messages: MessageType[]) => void | Promise<void>
  disabled?: boolean
  mainThreadAgentDefinition?: AgentDefinition
  disableSlashCommands?: boolean
  taskListId?: string
  remoteSessionConfig?: RemoteSessionConfig
  directConnectConfig?: DirectConnectConfig
  sshSession?: SSHSession
  thinkingConfig: ThinkingConfig
}

export type Screen = 'prompt' | 'transcript'

// ── REPL Component ──────────────────────────────────────────────────
export function REPL(props: Props) {
  const isRemoteSession = !!props.remoteSessionConfig

  // ── Env-var gates (computed once at mount) ──────────────────────
  const titleDisabled = isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE)
  const moreRightEnabled = 'external' === 'ant' && isEnvTruthy(process.env.CLAUDE_MORERIGHT)
  const disableVirtualScroll = isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL)
  const disableMessageActions = feature('MESSAGE_ACTIONS')
    ? isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS)
    : false

  // ── Lifecycle logging ──────────────────────────────────────────
  onMount(() => {
    logForDebugging(`[REPL:mount] REPL mounted, disabled=${props.disabled}`)
  })
  onCleanup(() => {
    logForDebugging(`[REPL:unmount] REPL unmounting`)
  })

  // ── State declarations (createSignal) ──────────────────────────
  const [mainThreadAgentDefinition, setMainThreadAgentDefinition] = createSignal(
    props.mainThreadAgentDefinition,
  )

  // NOTE: In the full integration these would come from the SolidJS AppState store.
  // For now, stubbed as signals matching the React useAppState() pattern.
  // The actual wiring to a SolidJS store happens in a later integration pass.

  const [localCommands, setLocalCommands] = createSignal(props.commands)
  const [dynamicMcpConfig, setDynamicMcpConfig] = createSignal<
    Record<string, ScopedMcpServerConfig> | undefined
  >(props.dynamicMcpConfig)
  const [screen, setScreen] = createSignal<Screen>('prompt')
  const [showAllInTranscript, setShowAllInTranscript] = createSignal(false)
  const [dumpMode, setDumpMode] = createSignal(false)
  const [editorStatus, setEditorStatus] = createSignal('')
  const [streamMode, setStreamMode] = createSignal<SpinnerMode>('responding')
  const [streamingToolUses, setStreamingToolUses] = createSignal<StreamingToolUse[]>([])
  const [streamingThinking, setStreamingThinking] = createSignal<StreamingThinking | null>(null)
  const [abortController, setAbortController] = createSignal<AbortController | null>(null)
  const [messages, rawSetMessages] = createSignal<MessageType[]>(props.initialMessages ?? [])
  const [inputValue, setInputValueRaw] = createSignal(consumeEarlyInput())
  const [inputMode, setInputMode] = createSignal<PromptInputMode>('prompt')
  const [stashedPrompt, setStashedPrompt] = createSignal<
    { text: string; cursorOffset: number; pastedContents: Record<number, PastedContent> } | undefined
  >()
  const [pastedContents, setPastedContents] = createSignal<Record<number, PastedContent>>({})
  const [submitCount, setSubmitCount] = createSignal(0)
  const [streamingText, setStreamingText] = createSignal<string | null>(null)
  const [lastQueryCompletionTime, setLastQueryCompletionTime] = createSignal(0)
  const [spinnerMessage, setSpinnerMessage] = createSignal<string | null>(null)
  const [spinnerColor, setSpinnerColor] = createSignal<keyof Theme | null>(null)
  const [spinnerShimmerColor, setSpinnerShimmerColor] = createSignal<keyof Theme | null>(null)
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] = createSignal(false)
  const [messageSelectorPreselect, setMessageSelectorPreselect] = createSignal<UserMessage | undefined>()
  const [showCostDialog, setShowCostDialog] = createSignal(false)
  const [conversationId, setConversationId] = createSignal(randomUUID())
  const [idleReturnPending, setIdleReturnPending] = createSignal<{
    input: string
    idleMinutes: number
  } | null>(null)
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = createSignal<ToolUseConfirm[]>([])
  const [permissionStickyFooter, setPermissionStickyFooter] = createSignal<JSX.Element | null>(null)
  const [sandboxPermissionRequestQueue, setSandboxPermissionRequestQueue] = createSignal<
    Array<{ hostPattern: NetworkHostPattern; resolvePromise: (allow: boolean) => void }>
  >([])
  const [promptQueue, setPromptQueue] = createSignal<
    Array<{
      request: PromptRequest
      title: string
      toolInputSummary?: string | null
      resolve: (response: PromptResponse) => void
      reject: (error: Error) => void
    }>
  >([])
  const [haveShownCostDialog, setHaveShownCostDialog] = createSignal(
    getGlobalConfig().hasAcknowledgedCostThreshold,
  )
  const [vimMode, setVimMode] = createSignal<VimMode>('INSERT')
  const [showBashesDialog, setShowBashesDialog] = createSignal<string | boolean>(false)
  const [isSearchingHistory, setIsSearchingHistory] = createSignal(false)
  const [isHelpOpen, setIsHelpOpen] = createSignal(false)
  const [haikuTitle, setHaikuTitle] = createSignal<string | undefined>()
  const [showIdeOnboarding, setShowIdeOnboarding] = createSignal(false)
  const [showModelSwitchCallout, setShowModelSwitchCallout] = createSignal(() => {
    if ('external' === 'ant') return shouldShowAntModelSwitch()
    return false
  })
  const [showEffortCallout, setShowEffortCallout] = createSignal(false) // will be initialized in onMount
  const [showDesktopUpsellStartup, setShowDesktopUpsellStartup] = createSignal(
    shouldShowDesktopUpsellStartup(),
  )
  const [showUndercoverCallout, setShowUndercoverCallout] = createSignal(false)
  const [ideSelection, setIDESelection] = createSignal<IDESelection | undefined>()
  const [ideToInstallExtension, setIDEToInstallExtension] = createSignal<IdeType | null>(null)
  const [ideInstallationStatus, setIDEInstallationStatus] =
    createSignal<IDEExtensionInstallationStatus | null>(null)
  const [autoUpdaterResult, setAutoUpdaterResult] = createSignal<AutoUpdaterResult | null>(null)
  const [isExternalLoading, setIsExternalLoadingRaw] = createSignal(
    props.remoteSessionConfig?.hasInitialPrompt ?? false,
  )
  const [userInputOnProcessing, setUserInputOnProcessingRaw] = createSignal<string | undefined>()
  const [isPromptInputActive, setIsPromptInputActive] = createSignal(false)
  const [inProgressToolUseIDs, setInProgressToolUseIDs] = createSignal<Set<string>>(new Set())
  const [autoRunIssueReason, setAutoRunIssueReason] = createSignal<AutoRunIssueReason | null>(null)
  const [exitFlow, setExitFlow] = createSignal<JSX.Element | null>(null)
  const [isExiting, setIsExiting] = createSignal(false)
  const [toolJSXInternal, setToolJSXInternal] = createSignal<{
    jsx: JSX.Element | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
  } | null>(null)
  const [frozenTranscriptState, setFrozenTranscriptState] = createSignal<{
    messagesLength: number
    streamingToolUsesLength: number
  } | null>(null)
  const [cursor, setCursor] = createSignal<MessageActionsState | null>(null)
  const [searchOpen, setSearchOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [searchCount, setSearchCount] = createSignal(0)
  const [searchCurrent, setSearchCurrent] = createSignal(0)
  const [remountKey, setRemountKey] = createSignal(0)

  // ── Plain variables (useRef -> let) ────────────────────────────
  let messagesRef = props.initialMessages ?? []
  let inputValueRef = consumeEarlyInput()
  let editorGenRef = 0
  let editorTimerRef: ReturnType<typeof setTimeout> | undefined
  let editorRenderingRef = false
  let streamModeRef: SpinnerMode = 'responding'
  let abortControllerRef: AbortController | null = null
  let sendBridgeResultRef: () => void = () => {}
  let restoreMessageSyncRef: (m: UserMessage) => void = () => {}
  let scrollRef: ScrollBoxHandle | null = null
  let modalScrollRef: ScrollBoxHandle | null = null
  let lastUserScrollTsRef = 0
  const queryGuard = new QueryGuard()
  let responseLengthRef = 0
  let apiMetricsRef: Array<{
    ttftMs: number
    firstTokenTime: number
    lastTokenTime: number
    responseLengthBaseline: number
    endResponseLength: number
  }> = []
  let loadingStartTimeRef = 0
  let totalPausedMsRef = 0
  let pauseStartTimeRef: number | null = null
  let wasQueryActiveRef = false
  let userInputBaselineRef = 0
  let userMessagePendingRef = false
  let swarmStartTimeRef: number | null = null
  let swarmBudgetInfoRef:
    | { tokens: number; limit: number; nudges: number }
    | undefined
  let focusedInputDialogRef: ReturnType<typeof getFocusedInputDialog> | undefined
  let skipIdleCheckRef = false
  let haikuTitleAttemptedRef = (props.initialMessages?.length ?? 0) > 0
  let tipPickedThisTurnRef = false
  let safeYoloMessageShownRef = false
  let worktreeTipShownRef = false
  let hasInterruptibleToolInProgressRef = false
  let idleHintShownRef: string | false = false
  let hasCountedQueueUseRef = false
  let initialMessageRef = false
  let didAutoRunIssueRef = false
  let localJSXCommandRef: typeof toolJSXInternal extends () => infer T ? T : never = null
  let prevDialogRef: ReturnType<typeof getFocusedInputDialog> | undefined
  let terminalFocusRef = false
  let lastQueryCompletionTimeRef = 0
  let cursorNavRef: MessageActionsNav | null = null
  let jumpRef: JumpHandle | null = null
  let trySuggestBgPRIntercept = SUGGEST_BG_PR_NOOP
  let insertTextRef: {
    insert: (text: string) => void
    setInputWithCursor: (value: string, cursor: number) => void
    cursorOffset: number
  } | null = null
  let sandboxBridgeCleanupRef = new Map<string, Array<() => void>>()
  let prevColsRef = 0

  // LRU caches (expensive init — created once)
  const readFileState = createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)
  const bashTools = new Set<string>()
  let bashToolsProcessedIdx = 0
  const discoveredSkillNamesRef = new Set<string>()
  const loadedNestedMemoryPathsRef = new Set<string>()

  // Content replacement state (lazy init)
  let contentReplacementState = provisionContentReplacementState(
    props.initialMessages,
    props.initialContentReplacements,
  )

  // ── Derived / computed ─────────────────────────────────────────

  // QueryGuard subscription — tracks "is a local query in flight"
  // In SolidJS we poll via createEffect instead of useSyncExternalStore
  const [isQueryActive, setIsQueryActive] = createSignal(false)
  onMount(() => {
    const unsub = queryGuard.subscribe(() => {
      setIsQueryActive(queryGuard.getSnapshot())
    })
    onCleanup(unsub)
  })

  const isLoading = createMemo(() => isQueryActive() || isExternalLoading())

  const terminalTitle = createMemo(() => {
    const sessionTitle = getCurrentSessionTitle(getSessionId())
    const agentTitle = mainThreadAgentDefinition()?.agentType
    return sessionTitle ?? agentTitle ?? haikuTitle() ?? 'Free Code'
  })

  const isWaitingForApproval = createMemo(
    () =>
      toolUseConfirmQueue().length > 0 ||
      promptQueue().length > 0,
      // NOTE: pendingWorkerRequest / pendingSandboxRequest come from AppState
      // and will be wired in the integration pass
  )

  const isShowingLocalJSXCommand = createMemo(() => {
    const t = toolJSXInternal()
    return t?.isLocalJSXCommand === true && t?.jsx != null
  })

  const titleIsAnimating = createMemo(
    () => isLoading() && !isWaitingForApproval() && !isShowingLocalJSXCommand(),
  )

  // ── Timing refs management ─────────────────────────────────────
  function resetTimingRefs() {
    loadingStartTimeRef = Date.now()
    totalPausedMsRef = 0
    pauseStartTimeRef = null
  }

  // Reset timing refs on query active transition false->true
  createEffect(() => {
    const active = isQueryActive()
    if (active && !wasQueryActiveRef) {
      resetTimingRefs()
    }
    wasQueryActiveRef = active
  })

  function setIsExternalLoading(value: boolean) {
    setIsExternalLoadingRaw(value)
    if (value) resetTimingRefs()
  }

  // ── setMessages wrapper (keeps messagesRef in sync) ────────────
  function setMessages(action: MessageType[] | ((prev: MessageType[]) => MessageType[])) {
    const prev = messagesRef
    const next = typeof action === 'function' ? action(messagesRef) : action
    messagesRef = next
    if (next.length < userInputBaselineRef) {
      userInputBaselineRef = 0
    } else if (next.length > prev.length && userMessagePendingRef) {
      const delta = next.length - prev.length
      const added =
        prev.length === 0 || next[0] === prev[0] ? next.slice(-delta) : next.slice(0, delta)
      if (added.some(isHumanTurn)) {
        userMessagePendingRef = false
      } else {
        userInputBaselineRef = next.length
      }
    }
    rawSetMessages(next)
  }

  function setUserInputOnProcessing(input: string | undefined) {
    if (input !== undefined) {
      userInputBaselineRef = messagesRef.length
      userMessagePendingRef = true
    } else {
      userMessagePendingRef = false
    }
    setUserInputOnProcessingRaw(input)
  }

  // ── setToolJSX wrapper (preserves local JSX commands) ──────────
  function setToolJSX(
    args: {
      jsx: JSX.Element | null
      shouldHidePromptInput: boolean
      shouldContinueAnimation?: true
      showSpinner?: boolean
      isLocalJSXCommand?: boolean
      clearLocalJSX?: boolean
      isImmediate?: boolean
    } | null,
  ) {
    if (args?.isLocalJSXCommand) {
      const { clearLocalJSX: _, ...rest } = args
      localJSXCommandRef = { ...rest, isLocalJSXCommand: true }
      setToolJSXInternal(rest)
      return
    }
    if (localJSXCommandRef) {
      if (args?.clearLocalJSX) {
        localJSXCommandRef = null
        setToolJSXInternal(null)
        return
      }
      return
    }
    if (args?.clearLocalJSX) {
      setToolJSXInternal(null)
      return
    }
    setToolJSXInternal(args)
  }

  // ── setInputValue wrapper ──────────────────────────────────────
  function setInputValue(value: string) {
    if (trySuggestBgPRIntercept(inputValueRef, value)) return
    if (
      inputValueRef === '' &&
      value !== '' &&
      Date.now() - lastUserScrollTsRef >= RECENT_SCROLL_REPIN_WINDOW_MS
    ) {
      repinScroll()
    }
    inputValueRef = value
    setInputValueRaw(value)
    setIsPromptInputActive(value.trim().length > 0)
  }

  // ── Scroll management ──────────────────────────────────────────
  function repinScroll() {
    scrollRef?.scrollToBottom()
    // onRepin() would be called here — wired in integration pass
    setCursor(null)
  }

  // ── setResponseLength ──────────────────────────────────────────
  function setResponseLength(f: (prev: number) => number) {
    const prev = responseLengthRef
    responseLengthRef = f(prev)
    if (responseLengthRef > prev) {
      const entries = apiMetricsRef
      if (entries.length > 0) {
        const lastEntry = entries.at(-1)!
        lastEntry.lastTokenTime = Date.now()
        lastEntry.endResponseLength = responseLengthRef
      }
    }
  }

  // ── Visible streaming text ─────────────────────────────────────
  const showStreamingText = createMemo(() => {
    // TODO: wire to appState settings.prefersReducedMotion
    return !hasCursorUpViewportYankBug()
  })

  function onStreamingText(f: (current: string | null) => string | null) {
    if (!showStreamingText()) return
    setStreamingText(f(streamingText()))
  }

  const visibleStreamingText = createMemo(() => {
    const text = streamingText()
    if (!text || !showStreamingText()) return null
    return text.substring(0, text.lastIndexOf('\n') + 1) || null
  })

  // ── Restore read file state helper ─────────────────────────────
  function restoreReadFileState(msgs: MessageType[], cwd: string) {
    const extracted = extractReadFilesFromMessages(msgs, cwd, READ_FILE_STATE_CACHE_SIZE)
    // mergeFileStateCaches mutates — readFileState is module-scoped
    mergeFileStateCaches(readFileState, extracted)
    for (const tool of extractBashToolsFromMessages(msgs)) {
      bashTools.add(tool)
    }
  }

  // ── Focused input dialog resolver ──────────────────────────────
  function getFocusedInputDialog():
    | 'message-selector'
    | 'sandbox-permission'
    | 'tool-permission'
    | 'prompt'
    | 'worker-sandbox-permission'
    | 'elicitation'
    | 'cost'
    | 'idle-return'
    | 'ide-onboarding'
    | 'model-switch'
    | 'undercover-callout'
    | 'effort-callout'
    | 'remote-callout'
    | 'lsp-recommendation'
    | 'plugin-hint'
    | 'desktop-upsell'
    | 'ultraplan-choice'
    | 'ultraplan-launch'
    | undefined {
    if (isExiting() || exitFlow()) return undefined
    if (isMessageSelectorVisible()) return 'message-selector'
    if (isPromptInputActive()) return undefined
    if (sandboxPermissionRequestQueue()[0]) return 'sandbox-permission'

    const tj = toolJSXInternal()
    const allowDialogsWithAnimation = !tj || tj.shouldContinueAnimation
    if (allowDialogsWithAnimation && toolUseConfirmQueue()[0]) return 'tool-permission'
    if (allowDialogsWithAnimation && promptQueue()[0]) return 'prompt'
    // Worker sandbox, elicitation, cost, idle-return, etc. would be wired
    // from AppState in the integration pass
    if (allowDialogsWithAnimation && !isLoading() && showCostDialog()) return 'cost'
    if (allowDialogsWithAnimation && idleReturnPending()) return 'idle-return'
    if (allowDialogsWithAnimation && showIdeOnboarding()) return 'ide-onboarding'
    if ('external' === 'ant' && allowDialogsWithAnimation && showModelSwitchCallout())
      return 'model-switch'
    if ('external' === 'ant' && allowDialogsWithAnimation && showUndercoverCallout())
      return 'undercover-callout'
    if (allowDialogsWithAnimation && showEffortCallout()) return 'effort-callout'
    if (allowDialogsWithAnimation && showDesktopUpsellStartup()) return 'desktop-upsell'
    return undefined
  }

  const focusedInputDialog = createMemo(() => getFocusedInputDialog())

  const hasSuppressedDialogs = createMemo(
    () =>
      isPromptInputActive() &&
      (sandboxPermissionRequestQueue()[0] ||
        toolUseConfirmQueue()[0] ||
        promptQueue()[0] ||
        showCostDialog()),
  )

  // Keep ref in sync
  createEffect(() => {
    focusedInputDialogRef = focusedInputDialog()
  })

  // Keep lastQueryCompletionTimeRef in sync
  createEffect(() => {
    lastQueryCompletionTimeRef = lastQueryCompletionTime()
  })

  // Keep streamModeRef in sync
  createEffect(() => {
    streamModeRef = streamMode()
  })

  // Keep abortControllerRef in sync
  createEffect(() => {
    abortControllerRef = abortController()
  })

  // ── Prevent sleep while working ────────────────────────────────
  createEffect(() => {
    if (isLoading() && !isWaitingForApproval() && !isShowingLocalJSXCommand()) {
      startPreventSleep()
      onCleanup(() => stopPreventSleep())
    }
  })

  // ── Auto-hide streaming thinking after 30s ─────────────────────
  createEffect(() => {
    const st = streamingThinking()
    if (st && !st.isStreaming && st.streamingEndedAt) {
      const elapsed = Date.now() - st.streamingEndedAt
      const remaining = 30000 - elapsed
      if (remaining > 0) {
        const timer = setTimeout(() => setStreamingThinking(null), remaining)
        onCleanup(() => clearTimeout(timer))
      } else {
        setStreamingThinking(null)
      }
    }
  })

  // ── Prompt input suppression timeout ───────────────────────────
  createEffect(() => {
    if (inputValue().trim().length === 0) return
    const timer = setTimeout(() => setIsPromptInputActive(false), PROMPT_SUPPRESSION_MS)
    onCleanup(() => clearTimeout(timer))
  })

  // ── Cost dialog check ──────────────────────────────────────────
  createEffect(() => {
    // Re-check on messages change
    const _msgs = messages()
    const totalCost = getTotalCost()
    if (totalCost >= 5 && !showCostDialog() && !haveShownCostDialog()) {
      logEvent('tengu_cost_threshold_reached', {})
      setHaveShownCostDialog(true)
      if (hasConsoleBillingAccess()) {
        setShowCostDialog(true)
      }
    }
  })

  // ── Session status ─────────────────────────────────────────────
  const sessionStatus = createMemo<TabStatusKind>(() => {
    if (isWaitingForApproval() || isShowingLocalJSXCommand()) return 'waiting'
    if (isLoading()) return 'busy'
    return 'idle'
  })

  // ── Pause/resume timing for permission dialogs ─────────────────
  createEffect(() => {
    if (!isLoading()) return
    const isPaused = focusedInputDialog() === 'tool-permission'
    const now = Date.now()
    if (isPaused && pauseStartTimeRef === null) {
      pauseStartTimeRef = now
    } else if (!isPaused && pauseStartTimeRef !== null) {
      totalPausedMsRef += now - pauseStartTimeRef
      pauseStartTimeRef = null
    }
  })

  // ── Re-pin scroll on permission overlay show/dismiss ───────────
  createEffect(() => {
    const was = prevDialogRef === 'tool-permission'
    const now = focusedInputDialog() === 'tool-permission'
    if (was !== now) repinScroll()
    prevDialogRef = focusedInputDialog()
  })

  // ── Re-pin scroll when last message is human ───────────────────
  createEffect(() => {
    const msgs = messages()
    const lastMsg = msgs.at(-1)
    if (lastMsg != null && isHumanTurn(lastMsg)) {
      repinScroll()
    }
  })

  // ── Register leader tool use confirm queue ─────────────────────
  onMount(() => {
    registerLeaderToolUseConfirmQueue(setToolUseConfirmQueue)
    onCleanup(() => unregisterLeaderToolUseConfirmQueue())
  })

  // ── Activity tracking ──────────────────────────────────────────
  createEffect(() => {
    // Track on input or submit changes
    const _iv = inputValue()
    const _sc = submitCount()
    activityManager.recordUserActivity()
    updateLastInteractionTime(true)
  })

  createEffect(() => {
    if (submitCount() === 1) {
      startBackgroundHousekeeping()
    }
  })

  // ── Tmux mouse hint ────────────────────────────────────────────
  onMount(() => {
    if (isFullscreenEnvEnabled()) {
      void maybeGetTmuxMouseHint().then((hint) => {
        if (hint) {
          // addNotification({ key: 'tmux-mouse-hint', text: hint, priority: 'low' })
          // NOTE: Notification system wired in integration pass
        }
      })
    }
  })

  // ── Extract read file state from initialMessages on mount ──────
  onMount(() => {
    if (props.initialMessages && props.initialMessages.length > 0) {
      restoreReadFileState(props.initialMessages, getOriginalCwd())
    }
  })

  // ── Initial load ───────────────────────────────────────────────
  onMount(() => {
    void onInit()
    onCleanup(() => {
      void diagnosticTracker.shutdown()
    })
  })

  // ── Worktree tip ───────────────────────────────────────────────
  onMount(() => {
    if (worktreeTipShownRef) return
    const wt = getCurrentWorktreeSession()
    if (!wt?.creationDurationMs || wt.usedSparsePaths) return
    if (wt.creationDurationMs < 15_000) return
    worktreeTipShownRef = true
    const secs = Math.round(wt.creationDurationMs / 1000)
    setMessages((prev) => [
      ...prev,
      createSystemMessage(
        `Worktree creation took ${secs}s. For large repos, set \`worktree.sparsePaths\` in .claude/settings.json to check out only the directories you need.`,
        'info',
      ),
    ])
  })

  // ── Plugin startup checks ──────────────────────────────────────
  onMount(() => {
    if (isRemoteSession) return
    // void performStartupChecks(setAppState) — wired in integration pass
  })

  // ── Startup cleanup ────────────────────────────────────────────
  onMount(() => {
    const reason = SandboxManager.getSandboxUnavailableReason()
    if (!reason) return
    if (SandboxManager.isSandboxRequired()) {
      process.stderr.write(
        `\nError: sandbox required but unavailable: ${reason}\n` +
          `  sandbox.failIfUnavailable is set — refusing to start without a working sandbox.\n\n`,
      )
      gracefulShutdownSync(1, 'other')
      return
    }
    logForDebugging(`sandbox disabled: ${reason}`, { level: 'warn' })
    // addNotification wired in integration pass
  })

  // ── Transcript search — clear on exit ──────────────────────────
  createEffect(() => {
    const inTranscript =
      screen() === 'transcript' && isFullscreenEnvEnabled() && !disableVirtualScroll
    if (!inTranscript) {
      setSearchQuery('')
      setSearchCount(0)
      setSearchCurrent(0)
      setSearchOpen(false)
      editorGenRef++
      clearTimeout(editorTimerRef)
      setDumpMode(false)
      setEditorStatus('')
    }
  })

  // ── Hide spinner when only Sleep tool is active ────────────────
  const onlySleepToolActive = createMemo(() => {
    const msgs = messages()
    const ids = inProgressToolUseIDs()
    const lastAssistant = msgs.findLast((m) => m.type === 'assistant')
    if (lastAssistant?.type !== 'assistant') return false
    const inProgressTUs = lastAssistant.message.content.filter(
      (b) => b.type === 'tool_use' && ids.has(b.id),
    )
    return (
      inProgressTUs.length > 0 &&
      inProgressTUs.every((b) => b.type === 'tool_use' && b.name === SLEEP_TOOL_NAME)
    )
  })

  // ── Show spinner logic ─────────────────────────────────────────
  const showSpinner = createMemo(() => {
    const tj = toolJSXInternal()
    if (tj && tj.showSpinner !== true) return false
    if (toolUseConfirmQueue().length > 0 || promptQueue().length > 0) return false
    if (
      !(
        isLoading() ||
        userInputOnProcessing() ||
        getCommandQueueLength() > 0
      )
    )
      return false
    if (onlySleepToolActive()) return false
    if (visibleStreamingText()) return false
    return true
  })

  // ── Stop hook spinner suffix ───────────────────────────────────
  const stopHookSpinnerSuffix = createMemo(() => {
    if (!isLoading()) return null
    const msgs = messages()
    const progressMsgs = msgs.filter(
      (m): m is ProgressMessage<HookProgress> =>
        m.type === 'progress' &&
        m.data.type === 'hook_progress' &&
        (m.data.hookEvent === 'Stop' || m.data.hookEvent === 'SubagentStop'),
    )
    if (progressMsgs.length === 0) return null
    const currentToolUseID = progressMsgs.at(-1)?.toolUseID
    if (!currentToolUseID) return null
    const hasSummary = msgs.some(
      (m) =>
        m.type === 'system' &&
        m.subtype === 'stop_hook_summary' &&
        m.toolUseID === currentToolUseID,
    )
    if (hasSummary) return null
    const currentHooks = progressMsgs.filter((p) => p.toolUseID === currentToolUseID)
    const total = currentHooks.length
    const completedCount = count(
      msgs,
      (m) =>
        m.type === 'attachment' &&
        'hookEvent' in m.attachment &&
        (m.attachment.hookEvent === 'Stop' || m.attachment.hookEvent === 'SubagentStop') &&
        'toolUseID' in m.attachment &&
        m.attachment.toolUseID === currentToolUseID,
    )
    const customMessage = currentHooks.find((p) => p.data.statusMessage)?.data.statusMessage
    if (customMessage) {
      return total === 1
        ? `${customMessage}\u2026`
        : `${customMessage}\u2026 ${completedCount}/${total}`
    }
    const hookType =
      currentHooks[0]?.data.hookEvent === 'SubagentStop' ? 'subagent stop' : 'stop'
    return total === 1
      ? `running ${hookType} hook`
      : `running stop hooks\u2026 ${completedCount}/${total}`
  })

  // ── Display messages (sync vs deferred) ────────────────────────
  // In SolidJS there is no useDeferredValue — all updates are granular.
  const displayedMessages = createMemo(() => {
    // viewedAgentTask wiring happens in integration pass
    return messages()
  })

  const placeholderText = createMemo(() =>
    shouldShowPlaceholder(
      userInputOnProcessing(),
      false, // viewedAgentTask — wired in integration pass
      displayedMessages().length,
      userInputBaselineRef,
    ),
  )

  // ── Unseen divider (stub — FullscreenLayout integration pass) ──
  const unseenDivider = createMemo(() =>
    computeUnseenDivider(messages(), 0), // dividerIndex wired later
  )

  // ── resetLoadingState ──────────────────────────────────────────
  function resetLoadingState() {
    setIsExternalLoading(false)
    setUserInputOnProcessing(undefined)
    responseLengthRef = 0
    apiMetricsRef = []
    setStreamingText(null)
    setStreamingToolUses([])
    setSpinnerMessage(null)
    setSpinnerColor(null)
    setSpinnerShimmerColor(null)
    // pickNewSpinnerTip() — wired in integration pass
    endInteractionSpan()
    clearSpeculativeChecks()
  }

  // ── onCancel ───────────────────────────────────────────────────
  function onCancel() {
    if (focusedInputDialog() === 'elicitation') return
    logForDebugging(
      `[onCancel] focusedInputDialog=${focusedInputDialog()} streamMode=${streamMode()}`,
    )
    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.pauseProactive()
    }
    queryGuard.forceEnd()
    skipIdleCheckRef = false

    // Preserve partially-streamed text
    const st = streamingText()
    if (st?.trim()) {
      setMessages((prev) => [...prev, createAssistantMessage({ content: st })])
    }
    resetLoadingState()

    if (feature('TOKEN_BUDGET')) {
      snapshotOutputTokensForTurn(null)
    }
    if (focusedInputDialog() === 'tool-permission') {
      toolUseConfirmQueue()[0]?.onAbort()
      setToolUseConfirmQueue([])
    } else if (focusedInputDialog() === 'prompt') {
      for (const item of promptQueue()) {
        item.reject(new Error('Prompt cancelled by user'))
      }
      setPromptQueue([])
      abortController()?.abort('user-cancel')
    } else {
      abortController()?.abort('user-cancel')
    }
    setAbortController(null)
  }

  // ── handleQueuedCommandOnCancel ────────────────────────────────
  function handleQueuedCommandOnCancel() {
    const result = popAllEditable(inputValue(), 0)
    if (!result) return
    setInputValue(result.text)
    setInputMode('prompt')
    if (result.images.length > 0) {
      setPastedContents((prev) => {
        const newContents = { ...prev }
        for (const image of result.images) {
          newContents[image.id] = image
        }
        return newContents
      })
    }
  }

  // ── onQueryEvent ───────────────────────────────────────────────
  function onQueryEvent(event: Parameters<typeof handleMessageFromStream>[0]) {
    handleMessageFromStream(
      event,
      (newMessage) => {
        if (isCompactBoundaryMessage(newMessage)) {
          if (isFullscreenEnvEnabled()) {
            setMessages((old) => [
              ...getMessagesAfterCompactBoundary(old, { includeSnipped: true }),
              newMessage,
            ])
          } else {
            setMessages(() => [newMessage])
          }
          setConversationId(randomUUID())
          if (feature('PROACTIVE') || feature('KAIROS')) {
            proactiveModule?.setContextBlocked(false)
          }
        } else if (
          newMessage.type === 'progress' &&
          isEphemeralToolProgress(newMessage.data.type)
        ) {
          setMessages((oldMessages) => {
            const last = oldMessages.at(-1)
            if (
              last?.type === 'progress' &&
              last.parentToolUseID === newMessage.parentToolUseID &&
              last.data.type === newMessage.data.type
            ) {
              const copy = oldMessages.slice()
              copy[copy.length - 1] = newMessage
              return copy
            }
            return [...oldMessages, newMessage]
          })
        } else {
          setMessages((oldMessages) => [...oldMessages, newMessage])
        }
        if (feature('PROACTIVE') || feature('KAIROS')) {
          if (
            newMessage.type === 'assistant' &&
            'isApiErrorMessage' in newMessage &&
            newMessage.isApiErrorMessage
          ) {
            proactiveModule?.setContextBlocked(true)
          } else if (newMessage.type === 'assistant') {
            proactiveModule?.setContextBlocked(false)
          }
        }
      },
      (newContent) => {
        setResponseLength((length) => length + newContent.length)
      },
      setStreamMode,
      setStreamingToolUses,
      (tombstonedMessage) => {
        setMessages((oldMessages) => oldMessages.filter((m) => m !== tombstonedMessage))
        void removeTranscriptMessage(tombstonedMessage.uuid)
      },
      setStreamingThinking,
      (metrics) => {
        const now = Date.now()
        const baseline = responseLengthRef
        apiMetricsRef.push({
          ...metrics,
          firstTokenTime: now,
          lastTokenTime: now,
          responseLengthBaseline: baseline,
          endResponseLength: baseline,
        })
      },
      onStreamingText,
    )
  }

  // ── onQueryImpl — the main query execution function ────────────
  async function onQueryImpl(
    messagesIncludingNewMessages: MessageType[],
    newMessages: MessageType[],
    ac: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
    effort?: EffortValue,
  ) {
    if (shouldQuery) {
      void diagnosticTracker.handleQueryStart([])
    }
    void maybeMarkProjectOnboardingComplete()

    // Title extraction for first user message
    if (!titleDisabled && !haikuTitleAttemptedRef) {
      const firstUserMessage = newMessages.find((m) => m.type === 'user' && !m.isMeta)
      const text =
        firstUserMessage?.type === 'user'
          ? getContentText(firstUserMessage.message.content)
          : null
      if (
        text &&
        !text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) &&
        !text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) &&
        !text.startsWith(`<${COMMAND_NAME_TAG}>`) &&
        !text.startsWith(`<${BASH_INPUT_TAG}>`)
      ) {
        haikuTitleAttemptedRef = true
        void generateSessionTitle(text, new AbortController().signal).then(
          (title) => {
            if (title) setHaikuTitle(title)
            else haikuTitleAttemptedRef = false
          },
          () => {
            haikuTitleAttemptedRef = false
          },
        )
      }
    }

    if (!shouldQuery) {
      if (newMessages.some(isCompactBoundaryMessage)) {
        setConversationId(randomUUID())
        if (feature('PROACTIVE') || feature('KAIROS')) {
          proactiveModule?.setContextBlocked(false)
        }
      }
      resetLoadingState()
      setAbortController(null)
      return
    }

    // Build tool use context — in integration pass this reads from the store
    // For now, stub the critical path
    queryCheckpoint('query_context_loading_start')
    const defaultSystemPrompt = await getSystemPrompt([], mainLoopModelParam, [], [])
    const [userContext, systemContext] = await Promise.all([getUserContext(), getSystemContext()])
    queryCheckpoint('query_context_loading_end')

    const systemPrompt = buildEffectiveSystemPrompt({
      mainThreadAgentDefinition: mainThreadAgentDefinition(),
      toolUseContext: undefined as any, // wired in integration pass
      customSystemPrompt: props.systemPrompt,
      defaultSystemPrompt,
      appendSystemPrompt: props.appendSystemPrompt,
    })

    queryCheckpoint('query_query_start')
    resetTurnHookDuration()
    resetTurnToolDuration()
    resetTurnClassifierDuration()

    // NOTE: The actual query() call requires a fully wired toolUseContext.
    // In the integration pass, getToolUseContext() will provide this.
    // For now the structure is correct but the context is a placeholder.

    resetLoadingState()
    logQueryProfileReport()
    await props.onTurnComplete?.(messagesRef)
  }

  // ── onQuery — wraps onQueryImpl with guard and lifecycle ───────
  async function onQuery(
    newMessages: MessageType[],
    ac: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
    onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>,
    input?: string,
    effort?: EffortValue,
  ): Promise<void> {
    if (isAgentSwarmsEnabled()) {
      const teamName = getTeamName()
      const agentName = getAgentName()
      if (teamName && agentName) {
        void setMemberActive(teamName, agentName, true)
      }
    }

    const thisGeneration = queryGuard.tryStart()
    if (thisGeneration === null) {
      logEvent('tengu_concurrent_onquery_detected', {})
      newMessages
        .filter((m): m is UserMessage => m.type === 'user' && !m.isMeta)
        .map((_) => getContentText(_.message.content))
        .filter((_) => _ !== null)
        .forEach((msg, i) => {
          enqueue({ value: msg, mode: 'prompt' })
          if (i === 0) logEvent('tengu_concurrent_onquery_enqueued', {})
        })
      return
    }

    try {
      resetTimingRefs()
      setMessages((oldMessages) => [...oldMessages, ...newMessages])
      responseLengthRef = 0
      if (feature('TOKEN_BUDGET')) {
        const parsedBudget = input ? parseTokenBudget(input) : null
        snapshotOutputTokensForTurn(parsedBudget ?? getCurrentTurnTokenBudget())
      }
      apiMetricsRef = []
      setStreamingToolUses([])
      setStreamingText(null)

      const latestMessages = messagesRef

      if (onBeforeQueryCallback && input) {
        const shouldProceed = await onBeforeQueryCallback(input, latestMessages)
        if (!shouldProceed) return
      }
      await onQueryImpl(
        latestMessages,
        newMessages,
        ac,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModelParam,
        effort,
      )
    } finally {
      if (queryGuard.end(thisGeneration)) {
        setLastQueryCompletionTime(Date.now())
        skipIdleCheckRef = false
        resetLoadingState()
        sendBridgeResultRef()

        // Turn duration message
        const turnDurationMs = Date.now() - loadingStartTimeRef - totalPausedMsRef
        if (turnDurationMs > 30000 && !ac.signal.aborted) {
          setMessages((prev) => [
            ...prev,
            createTurnDurationMessage(
              turnDurationMs,
              undefined,
              count(prev, isLoggableMessage),
            ),
          ])
        }
        setAbortController(null)
      }

      // Auto-restore on user cancel
      if (
        ac.signal.reason === 'user-cancel' &&
        !queryGuard.isActive &&
        inputValueRef === '' &&
        getCommandQueueLength() === 0
      ) {
        const msgs = messagesRef
        const lastUserMsg = msgs.findLast(selectableUserMessagesFilter)
        if (lastUserMsg) {
          const idx = msgs.lastIndexOf(lastUserMsg)
          if (messagesAfterAreOnlySynthetic(msgs, idx)) {
            removeLastFromHistory()
            restoreMessageSyncRef(lastUserMsg)
          }
        }
      }
    }
  }

  // ── onSubmit — handles user prompt submission ──────────────────
  async function onSubmit(
    input: string,
    helpers: PromptInputHelpers,
    speculationAccept?: {
      state: ActiveSpeculationState
      speculationSessionTimeSavedMs: number
      setAppState: SetAppState
    },
    options?: { fromKeybinding?: boolean },
  ) {
    repinScroll()

    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.resumeProactive()
    }

    // Handle immediate commands
    if (!speculationAccept && input.trim().startsWith('/')) {
      const trimmedInput = expandPastedTextRefs(input, pastedContents()).trim()
      const { commandName, commandArgs, matchingCommand } = parseSlashCommand(
        trimmedInput,
        localCommands(),
      )
      const shouldTreatAsImmediate =
        queryGuard.isActive && (matchingCommand?.immediate || options?.fromKeybinding)
      if (
        matchingCommand &&
        shouldTreatAsImmediate &&
        matchingCommand.type === 'local-jsx'
      ) {
        if (input.trim() === inputValueRef.trim()) {
          setInputValue('')
          helpers.setCursorOffset(0)
          helpers.clearBuffer()
          setPastedContents({})
        }
        // Execute immediate command — detailed implementation wired in integration pass
        return
      }
    }

    // Skip empty input for remote mode
    // Remote mode wiring happens in integration pass

    // Add to history
    if (!options?.fromKeybinding) {
      addToHistory({
        display: speculationAccept
          ? input
          : prependModeCharacterToInput(input, inputMode()),
        pastedContents: speculationAccept ? {} : pastedContents(),
      })
      if (inputMode() === 'bash') {
        prependToShellHistoryCache(input.trim())
      }
    }

    // Restore stash
    const isSlashCommand = !speculationAccept && input.trim().startsWith('/')
    const submitsNow = !isLoading() || !!speculationAccept
    if (stashedPrompt() !== undefined && !isSlashCommand && submitsNow) {
      const sp = stashedPrompt()!
      setInputValue(sp.text)
      helpers.setCursorOffset(sp.cursorOffset)
      setPastedContents(sp.pastedContents)
      setStashedPrompt(undefined)
    } else if (submitsNow) {
      if (!options?.fromKeybinding) {
        setInputValue('')
        helpers.setCursorOffset(0)
      }
      setPastedContents({})
    }

    if (submitsNow) {
      setInputMode('prompt')
      setIDESelection(undefined)
      setSubmitCount((c) => c + 1)
      helpers.clearBuffer()
      tipPickedThisTurnRef = false

      if (
        !isSlashCommand &&
        inputMode() === 'prompt' &&
        !speculationAccept
      ) {
        setUserInputOnProcessing(input)
        resetTimingRefs()
      }
    }

    // Speculation acceptance path
    if (speculationAccept) {
      // handleSpeculationAccept wired in integration pass
      return
    }

    // Main submission path via handlePromptSubmit
    // Full wiring happens in integration pass — the function signature is preserved
  }

  // ── onAgentSubmit ──────────────────────────────────────────────
  async function onAgentSubmit(
    input: string,
    task: InProcessTeammateTaskState | LocalAgentTaskState,
    helpers: PromptInputHelpers,
  ) {
    if (isLocalAgentTask(task)) {
      // appendMessageToLocalAgent wired via setAppState in integration pass
    } else {
      // injectUserMessageToTeammate wired via setAppState in integration pass
    }
    setInputValue('')
    helpers.setCursorOffset(0)
    helpers.clearBuffer()
  }

  // ── handleExit ─────────────────────────────────────────────────
  async function handleExit() {
    setIsExiting(true)
    if (feature('BG_SESSIONS') && isBgSession()) {
      spawnSync('tmux', ['detach-client'], { stdio: 'ignore' })
      setIsExiting(false)
      return
    }
    // ExitFlow wiring happens in integration pass
  }

  // ── rewindConversationTo ───────────────────────────────────────
  function rewindConversationTo(message: UserMessage) {
    const prev = messagesRef
    const messageIndex = prev.lastIndexOf(message)
    if (messageIndex === -1) return
    logEvent('tengu_conversation_rewind', {
      preRewindMessageCount: prev.length,
      postRewindMessageCount: messageIndex,
      messagesRemoved: prev.length - messageIndex,
      rewindToMessageIndex: messageIndex,
    })
    setMessages(prev.slice(0, messageIndex))
    setConversationId(randomUUID())
    resetMicrocompactState()
  }

  // ── restoreMessageSync ─────────────────────────────────────────
  function restoreMessageSync(message: UserMessage) {
    rewindConversationTo(message)
    const r = textForResubmit(message)
    if (r) {
      setInputValue(r.text)
      setInputMode(r.mode)
    }
    // Restore pasted images
    if (
      Array.isArray(message.message.content) &&
      message.message.content.some((block) => block.type === 'image')
    ) {
      const imageBlocks = message.message.content.filter(
        (block): block is ImageBlockParam => block.type === 'image',
      )
      if (imageBlocks.length > 0) {
        const newPastedContents: Record<number, PastedContent> = {}
        imageBlocks.forEach((block, index) => {
          if (block.source.type === 'base64') {
            const id = message.imagePasteIds?.[index] ?? index + 1
            newPastedContents[id] = {
              id,
              type: 'image',
              content: block.source.data,
              mediaType: block.source.media_type,
            }
          }
        })
        setPastedContents(newPastedContents)
      }
    }
  }
  restoreMessageSyncRef = restoreMessageSync

  // ── handleRestoreMessage (deferred) ────────────────────────────
  function handleRestoreMessage(message: UserMessage) {
    setImmediate(() => restoreMessageSync(message))
  }

  // ── resume ─────────────────────────────────────────────────────
  async function resume(sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) {
    const resumeStart = performance.now()
    try {
      const msgs = deserializeMessages(log.messages)

      const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
      await executeSessionEndHooks('resume', {
        getAppState: () => ({}), // wired to store in integration pass
        setAppState: () => {},
        signal: AbortSignal.timeout(sessionEndTimeoutMs),
        timeoutMs: sessionEndTimeoutMs,
      } as any)

      const hookMessages = await processSessionStartHooks('resume', {
        sessionId,
        agentType: mainThreadAgentDefinition()?.agentType,
        model: '', // mainLoopModel wired in integration pass
      })
      msgs.push(...hookMessages)

      if (entrypoint === 'fork') {
        void copyPlanForFork(log, asSessionId(sessionId))
      } else {
        void copyPlanForResume(log, asSessionId(sessionId))
      }

      // restoreSessionStateFromLog(log, setAppState) — wired in integration pass

      restoreReadFileState(msgs, log.projectPath ?? getOriginalCwd())
      resetLoadingState()
      setAbortController(null)
      setConversationId(sessionId)

      const targetSessionCosts = getStoredSessionCosts(sessionId)
      saveCurrentSessionCosts()
      resetCostState()
      switchSession(
        asSessionId(sessionId),
        log.fullPath ? dirname(log.fullPath) : null,
      )

      const { renameRecordingForSession } = await import('../../../utils/asciicast.js')
      await renameRecordingForSession()
      await resetSessionFilePointer()

      clearSessionMetadata()
      restoreSessionMetadata(log)
      haikuTitleAttemptedRef = true
      setHaikuTitle(undefined)

      if (entrypoint !== 'fork') {
        exitRestoredWorktree()
        restoreWorktreeForResume(log.worktreeSession)
        adoptResumedSessionFile()
      }

      if (contentReplacementState && entrypoint !== 'fork') {
        contentReplacementState = reconstructContentReplacementState(
          msgs,
          log.contentReplacements ?? [],
        )
      }

      if (targetSessionCosts) {
        setCostStateForRestore(targetSessionCosts)
      }

      setMessages(() => msgs)
      setToolJSX(null)
      setInputValue('')
      logEvent('tengu_session_resumed', {
        entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
        resume_duration_ms: Math.round(performance.now() - resumeStart),
      })
    } catch (error) {
      logEvent('tengu_session_resumed', {
        entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: false,
      })
      throw error
    }
  }

  // ── onInit ─────────────────────────────────────────────────────
  async function onInit() {
    // Populate readFileState with CLAUDE.md files at startup
    const memoryFiles = await getMemoryFiles()
    if (memoryFiles.length > 0) {
      const fileList = memoryFiles
        .map(
          (f) =>
            `  [${f.type}] ${f.path} (${f.content.length} chars)${f.parent ? ` (included by ${f.parent})` : ''}`,
        )
        .join('\n')
      logForDebugging(`Loaded ${memoryFiles.length} CLAUDE.md/rules files:\n${fileList}`)
    }
    for (const file of memoryFiles) {
      readFileState.set(file.path, {
        content: file.contentDiffersFromDisk
          ? (file.rawContent ?? file.content)
          : file.content,
        timestamp: Date.now(),
        offset: undefined,
        limit: undefined,
        isPartialView: file.contentDiffersFromDisk,
      })
    }
  }

  // ── Notification effects (idle, completion) ────────────────────
  createEffect(() => {
    if (isLoading()) return
    if (submitCount() === 0) return
    if (lastQueryCompletionTime() === 0) return

    const timer = setTimeout(() => {
      const lastUserInteraction = getLastInteractionTime()
      if (lastUserInteraction > lastQueryCompletionTimeRef) return
      const idleTimeSinceResponse = Date.now() - lastQueryCompletionTimeRef
      if (
        !isLoading() &&
        !toolJSXInternal() &&
        focusedInputDialogRef === undefined &&
        idleTimeSinceResponse >= getGlobalConfig().messageIdleNotifThresholdMs
      ) {
        // sendNotification wired in integration pass
      }
    }, getGlobalConfig().messageIdleNotifThresholdMs)
    onCleanup(() => clearTimeout(timer))
  })

  // ── Transcript mode handlers ───────────────────────────────────
  function handleEnterTranscript() {
    setFrozenTranscriptState({
      messagesLength: messages().length,
      streamingToolUsesLength: streamingToolUses().length,
    })
  }

  function handleExitTranscript() {
    setFrozenTranscriptState(null)
  }

  // ── Transcript slicing ─────────────────────────────────────────
  const transcriptMessages = createMemo(() => {
    const frozen = frozenTranscriptState()
    const dm = displayedMessages()
    return frozen ? dm.slice(0, frozen.messagesLength) : dm
  })

  const transcriptStreamingToolUses = createMemo(() => {
    const frozen = frozenTranscriptState()
    const stu = streamingToolUses()
    return frozen ? stu.slice(0, frozen.streamingToolUsesLength) : stu
  })

  // ── Computed layout flags ──────────────────────────────────────
  const virtualScrollActive = createMemo(
    () => isFullscreenEnvEnabled() && !disableVirtualScroll,
  )
  const toolJsxCentered = createMemo(
    () => isFullscreenEnvEnabled() && toolJSXInternal()?.isLocalJSXCommand === true,
  )

  // ── JSX ────────────────────────────────────────────────────────
  // The JSX tree below mirrors the React version using SolidJS primitives.
  // Sub-component wiring (Messages, PromptInput, PermissionRequest, etc.)
  // uses the same import patterns as the other solid ports in src/ui/solid/.
  //
  // NOTE: The full JSX tree is a 1:1 structural port. Components referenced
  // here (Messages.solid.tsx, PromptInput.solid.tsx, PermissionRequest.solid.tsx,
  // FullscreenLayout.solid.tsx, etc.) already exist in src/ui/solid/components/
  // and src/ui/solid/permissions/. The actual <ComponentName ... /> usage is
  // deferred to the integration pass that wires real component imports.

  return (
    <Show
      when={screen() !== 'transcript'}
      fallback={
        // ── Transcript mode ──────────────────────────────────────
        <box flexDirection="column" width="100%">
          {/* TranscriptModeFooter, ScrollKeybindingHandler, Messages in
              transcript mode — wired in integration pass via:
              - Messages.solid.tsx (src/ui/solid/components/Messages.solid.tsx)
              - FullscreenLayout.solid.tsx
              - ScrollKeybindingHandler.solid.tsx */}
          <text dimmed>
            Showing detailed transcript
          </text>
        </box>
      }
    >
      {/* ── Normal (prompt) mode ────────────────────────────────── */}
      <box flexDirection="column" width="100%">
        {/* FullscreenLayout wraps everything in fullscreen mode.
            Ported as FullscreenLayout.solid.tsx — wired in integration pass. */}

        {/* Messages component — ported as Messages.solid.tsx */}
        {/* <Messages messages={displayedMessages()} ... /> */}

        {/* Spinner */}
        <Show when={showSpinner()}>
          {/* SpinnerWithVerb — ported as Spinner.solid.tsx */}
          <text>Working...</text>
        </Show>

        {/* Tool permission overlay */}
        <Show when={focusedInputDialog() === 'tool-permission' && toolUseConfirmQueue()[0]}>
          {/* PermissionRequest.solid.tsx — already ported */}
          <text>Permission request pending...</text>
        </Show>

        {/* Sandbox permission request */}
        <Show
          when={
            focusedInputDialog() === 'sandbox-permission' && sandboxPermissionRequestQueue()[0]
          }
        >
          {/* SandboxPermissionRequest.solid.tsx — already ported */}
          <text>Sandbox permission request...</text>
        </Show>

        {/* Prompt dialog */}
        <Show when={focusedInputDialog() === 'prompt' && promptQueue()[0]}>
          {/* PromptDialog — wired in integration pass */}
          <text>Prompt dialog...</text>
        </Show>

        {/* Elicitation dialog */}
        <Show when={focusedInputDialog() === 'elicitation'}>
          {/* ElicitationDialog — already ported */}
          <text>Elicitation...</text>
        </Show>

        {/* Cost threshold dialog */}
        <Show when={focusedInputDialog() === 'cost'}>
          {/* CostThresholdDialog.solid.tsx — already ported */}
          <text>Cost threshold reached</text>
        </Show>

        {/* Idle return dialog */}
        <Show when={focusedInputDialog() === 'idle-return' && idleReturnPending()}>
          {/* IdleReturnDialog.solid.tsx — already ported */}
          <text>Idle return...</text>
        </Show>

        {/* IDE onboarding */}
        <Show when={focusedInputDialog() === 'ide-onboarding'}>
          {/* IdeOnboardingDialog.solid.tsx — already ported */}
          <text>IDE onboarding...</text>
        </Show>

        {/* Effort callout */}
        <Show when={focusedInputDialog() === 'effort-callout'}>
          {/* EffortCallout.solid.tsx — already ported */}
          <text>Effort callout...</text>
        </Show>

        {/* Desktop upsell */}
        <Show when={focusedInputDialog() === 'desktop-upsell'}>
          {/* DesktopUpsellStartup.solid.tsx — already ported */}
          <text>Desktop upsell...</text>
        </Show>

        {/* Exit flow */}
        <Show when={exitFlow()}>
          {exitFlow()}
        </Show>

        {/* Tool JSX overlay (non-centered, non-immediate) */}
        <Show when={toolJSXInternal() && !toolJsxCentered()}>
          <box flexDirection="column" width="100%">
            {toolJSXInternal()?.jsx}
          </box>
        </Show>

        {/* PromptInput — already ported as PromptInput.solid.tsx */}
        <Show
          when={
            !toolJSXInternal()?.shouldHidePromptInput &&
            !focusedInputDialog() &&
            !isExiting() &&
            !props.disabled &&
            !cursor()
          }
        >
          {/* PromptInput.solid.tsx wired in integration pass with full props */}
          <text dimmed>{'> '}</text>
        </Show>

        {/* Message selector */}
        <Show when={focusedInputDialog() === 'message-selector'}>
          {/* MessageSelector.solid.tsx — already ported */}
          <text>Message selector...</text>
        </Show>

        {/* Message actions bar */}
        <Show when={cursor()}>
          {/* MessageActionsBar.solid.tsx — already ported */}
          <text>Message actions</text>
        </Show>
      </box>
    </Show>
  )
}
