import { createSignal, createEffect, createMemo, onCleanup, Show, type JSXElement } from 'solid-js'
import { feature } from 'bun:bundle'
import { logEvent } from 'src/services/analytics/index.js'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'
import {
  getIsRemoteMode,
  getKairosActive,
  getMainThreadAgentType,
  getOriginalCwd,
  getSdkBetas,
  getSessionId,
} from '../../../bootstrap/state.js'
import { DEFAULT_OUTPUT_STYLE_NAME } from '../../../constants/outputStyles.js'
import { useNotifications } from '../../../context/notifications.js'
import {
  getTotalAPIDuration,
  getTotalCost,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
} from '../../../cost-tracker.js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { type ReadonlySettings, useSettings } from '../../../hooks/useSettings.js'
import type { Message } from '../../../types/message.js'
import type { StatusLineCommandInput } from '../../../types/statusLine.js'
import type { VimMode } from '../../../types/textInputTypes.js'
import { checkHasTrustDialogAccepted } from '../../../utils/config.js'
import { calculateContextPercentages, getContextWindowForModel } from '../../../utils/context.js'
import { getCwd } from '../../../utils/cwd.js'
import { logForDebugging } from '../../../utils/debug.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { createBaseHookInput, executeStatusLineCommand } from '../../../utils/hooks.js'
import { getLastAssistantMessage } from '../../../utils/messages.js'
import { getRuntimeMainLoopModel, type ModelName, renderModelName } from '../../../utils/model/model.js'
import { getCurrentSessionTitle } from '../../../utils/sessionStorage.js'
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../../../utils/tokens.js'
import { getCurrentWorktreeSession } from '../../../utils/worktree.js'
import { isVimModeEnabled } from '../../components/PromptInput/utils.js'
import { getRawUtilization } from '../../../services/claudeAiLimits.js'

export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false
  return settings?.statusLine !== undefined
}

function buildStatusLineCommandInput(
  permissionMode: PermissionMode,
  exceeds200kTokens: boolean,
  settings: ReadonlySettings,
  messages: Message[],
  addedDirs: string[],
  mainLoopModel: ModelName,
  vimMode?: VimMode,
): StatusLineCommandInput {
  const agentType = getMainThreadAgentType()
  const worktreeSession = getCurrentWorktreeSession()
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens,
  })
  const outputStyleName = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME
  const currentUsage = getCurrentUsage(messages)
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas())
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize)
  const sessionId = getSessionId()
  const sessionName = getCurrentSessionTitle(sessionId)
  const rawUtil = getRawUtilization()
  const rateLimits: StatusLineCommandInput['rate_limits'] = {
    ...(rawUtil.five_hour && {
      five_hour: {
        used_percentage: rawUtil.five_hour.utilization * 100,
        resets_at: rawUtil.five_hour.resets_at,
      },
    }),
    ...(rawUtil.seven_day && {
      seven_day: {
        used_percentage: rawUtil.seven_day.utilization * 100,
        resets_at: rawUtil.seven_day.resets_at,
      },
    }),
  }
  return {
    ...createBaseHookInput(),
    ...(sessionName && { session_name: sessionName }),
    model: {
      id: runtimeModel,
      display_name: renderModelName(runtimeModel),
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs,
    },
    version: MACRO.VERSION,
    output_style: { name: outputStyleName },
    cost: {
      total_cost_usd: getTotalCost(),
      total_duration_ms: getTotalDuration(),
      total_api_duration_ms: getTotalAPIDuration(),
      total_lines_added: getTotalLinesAdded(),
      total_lines_removed: getTotalLinesRemoved(),
    },
    context_window: {
      total_input_tokens: getTotalInputTokens(),
      total_output_tokens: getTotalOutputTokens(),
      context_window_size: contextWindowSize,
      current_usage: currentUsage,
      used_percentage: contextPercentages.used,
      remaining_percentage: contextPercentages.remaining,
    },
    exceeds_200k_tokens: exceeds200kTokens,
    ...((rateLimits.five_hour || rateLimits.seven_day) && { rate_limits: rateLimits }),
    ...(isVimModeEnabled() && { vim: { mode: vimMode ?? 'INSERT' } }),
    ...(agentType && { agent: { name: agentType } }),
    ...(getIsRemoteMode() && { remote: { session_id: getSessionId() } }),
    ...(worktreeSession && {
      worktree: {
        name: worktreeSession.worktreeName,
        path: worktreeSession.worktreePath,
        branch: worktreeSession.worktreeBranch,
        original_cwd: worktreeSession.originalCwd,
        original_branch: worktreeSession.originalBranch,
      },
    }),
  }
}

type Props = {
  messagesRef: { current: Message[] }
  lastAssistantMessageId: string | null
  vimMode?: VimMode
}

export function getLastAssistantMessageId(messages: Message[]): string | null {
  return getLastAssistantMessage(messages)?.uuid ?? null
}

function StatusLineInner(props: Props): JSXElement {
  let abortController: AbortController | undefined
  const permissionMode = useAppState((s: any) => s.toolPermissionContext.mode)
  const additionalWorkingDirectories = useAppState(
    (s: any) => s.toolPermissionContext.additionalWorkingDirectories,
  )
  const statusLineText = useAppState((s: any) => s.statusLineText)
  const setAppState = useSetAppState()
  const settings = useSettings()
  const { addNotification } = useNotifications()
  const mainLoopModel = useMainLoopModel()

  // Latest-value refs: in Solid closures always see current signals,
  // but for non-reactive reads inside async callbacks, use let vars.
  let settingsRef = settings
  let vimModeRef = props.vimMode
  let permissionModeRef = permissionMode
  let addedDirsRef = additionalWorkingDirectories
  let mainLoopModelRef = mainLoopModel

  // Track for change detection
  let previousExceeds200k = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let logNextResult = true

  async function doUpdate() {
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    const msgs = props.messagesRef.current
    const logResult = logNextResult
    logNextResult = false
    try {
      const exceeds200kTokens = doesMostRecentAssistantMessageExceed200k(msgs)
      previousExceeds200k = exceeds200kTokens
      const commandInput = buildStatusLineCommandInput(
        permissionModeRef,
        exceeds200kTokens,
        settingsRef,
        msgs,
        addedDirsRef ?? [],
        mainLoopModelRef,
        vimModeRef,
      )
      const result = await executeStatusLineCommand(
        settingsRef.statusLine!,
        commandInput,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (logResult) {
        logForDebugging(`[StatusLine] result: ${JSON.stringify(result)}`)
      }
      if (result.error) {
        logForDebugging(`[StatusLine] error: ${result.error}`)
        return
      }
      setAppState((prev: any) =>
        prev.statusLineText === result.output ? prev : { ...prev, statusLineText: result.output },
      )
    } catch {
      // Silently swallow — abort or command failure
    }
  }

  // Trigger update on relevant changes
  createEffect(() => {
    // Track reactive deps
    const _msg = props.lastAssistantMessageId
    const _perm = permissionMode
    const _vim = props.vimMode
    const _model = mainLoopModel

    // Update refs
    settingsRef = settings
    vimModeRef = props.vimMode
    permissionModeRef = permissionMode
    addedDirsRef = additionalWorkingDirectories
    mainLoopModelRef = mainLoopModel

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void doUpdate(), 100)
  })

  // Re-run when settings change
  createEffect(() => {
    const _s = settings
    logNextResult = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void doUpdate(), 100)
  })

  onCleanup(() => {
    abortController?.abort()
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return (
    <Show when={statusLineText}>
      <box width="100%">
        <text>{statusLineText}</text>
      </box>
    </Show>
  )
}

export const StatusLine = (props: Props): JSXElement => {
  const settings = useSettings()

  return (
    <Show when={statusLineShouldDisplay(settings)}>
      <StatusLineInner {...props} />
    </Show>
  )
}
