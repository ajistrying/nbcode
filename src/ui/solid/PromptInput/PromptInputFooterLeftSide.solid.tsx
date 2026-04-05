import { createSignal, createEffect, createMemo, Show, type JSXElement } from 'solid-js'
import { feature } from 'bun:bundle'
import figures from 'figures'
import type { VimMode, PromptInputMode } from '../../../types/textInputTypes.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import { isVimModeEnabled } from '../../../components/PromptInput/utils.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import {
  isDefaultMode,
  permissionModeSymbol,
  permissionModeTitle,
  getModeColor,
} from '../../../utils/permissions/PermissionMode.js'
import { BackgroundTaskStatus } from '../tasks/BackgroundTaskStatus.solid.js'
import { isBackgroundTask } from '../../../tasks/types.js'
import { isPanelAgentTask } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getVisibleAgentTasks } from '../../../components/CoordinatorAgentStatus.js'
import { count } from '../../../utils/array.js'
import { shouldHideTasksFooter } from '../../../tasks/taskStatusUtils.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { TeamStatus } from '../../../components/teams/TeamStatus.js'
import { isInProcessEnabled } from '../../../utils/swarm/backends/registry.js'
import { useAppState, useAppStateStore } from 'src/state/AppState.js'
import { getIsRemoteMode } from '../../../bootstrap/state.js'
import HistorySearchInput from '../../../components/PromptInput/HistorySearchInput.js'
import { usePrStatus } from '../../../hooks/usePrStatus.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { formatDuration } from '../../../utils/format.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { PrBadge } from '../components/PrBadge.solid.js'

// Dead code elimination: conditional import for proactive mode
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../../../proactive/index.js')
    : null

const NO_OP_SUBSCRIBE = (_cb: () => void) => () => {}
const NULL = () => null
const MAX_VOICE_HINT_SHOWS = 3

type Props = {
  exitMessage: { show: boolean; key?: string }
  vimMode: VimMode | undefined
  mode: PromptInputMode
  toolPermissionContext: ToolPermissionContext
  suppressHint: boolean
  isLoading: boolean
  showMemoryTypeSelector?: boolean
  tasksSelected: boolean
  teamsSelected: boolean
  tmuxSelected: boolean
  teammateFooterIndex?: number
  isPasting?: boolean
  isSearching: boolean
  historyQuery: string
  setHistoryQuery: (query: string) => void
  historyFailedMatch: boolean
  onOpenTasksDialog?: (taskId?: string) => void
}

function ProactiveCountdown(): JSXElement {
  // Subscribe to proactive module's changes
  const [nextTickAt, setNextTickAt] = createSignal<number | null>(null)

  createEffect(() => {
    const unsubscribe = (proactiveModule?.subscribeToProactiveChanges ?? NO_OP_SUBSCRIBE)(() => {
      setNextTickAt((proactiveModule?.getNextTickAt ?? NULL)())
    })
    // Initial read
    setNextTickAt((proactiveModule?.getNextTickAt ?? NULL)())
    return unsubscribe
  })

  const [remainingSeconds, setRemainingSeconds] = createSignal<number | null>(null)

  createEffect(() => {
    const tick = nextTickAt()
    if (tick === null) {
      setRemainingSeconds(null)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((tick - Date.now()) / 1000))
      setRemainingSeconds(remaining)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  })

  return (
    <Show when={remainingSeconds() !== null}>
      <text dimmed>
        waiting {formatDuration(remainingSeconds()! * 1000, { mostSignificantOnly: true })}
      </text>
    </Show>
  )
}

export function PromptInputFooterLeftSide(props: Props): JSXElement {
  const showVim = createMemo(
    () => isVimModeEnabled() && props.vimMode === 'INSERT' && !props.isSearching,
  )

  // Early returns as Show blocks
  return (
    <>
      <Show when={props.exitMessage.show}>
        <text dimmed>Press {props.exitMessage.key} again to exit</text>
      </Show>

      <Show when={!props.exitMessage.show && props.isPasting}>
        <text dimmed>Pasting text\u2026</text>
      </Show>

      <Show when={!props.exitMessage.show && !props.isPasting}>
        <Show when={props.isSearching}>
          <HistorySearchInput
            value={props.historyQuery}
            onChange={props.setHistoryQuery}
            historyFailedMatch={props.historyFailedMatch}
          />
        </Show>

        <Show when={showVim()}>
          <text dimmed>-- INSERT --</text>
        </Show>

        <Show when={!props.suppressHint && !showVim()}>
          <ModeIndicator
            mode={props.mode}
            toolPermissionContext={props.toolPermissionContext}
            showHint={true}
            isLoading={props.isLoading}
            tasksSelected={props.tasksSelected}
            teamsSelected={props.teamsSelected}
            teammateFooterIndex={props.teammateFooterIndex}
            tmuxSelected={props.tmuxSelected}
            onOpenTasksDialog={props.onOpenTasksDialog}
          />
        </Show>

        <Show when={props.suppressHint || showVim()}>
          <ModeIndicator
            mode={props.mode}
            toolPermissionContext={props.toolPermissionContext}
            showHint={false}
            isLoading={props.isLoading}
            tasksSelected={props.tasksSelected}
            teamsSelected={props.teamsSelected}
            teammateFooterIndex={props.teammateFooterIndex}
            tmuxSelected={props.tmuxSelected}
            onOpenTasksDialog={props.onOpenTasksDialog}
          />
        </Show>

        <ProactiveCountdown />
      </Show>
    </>
  )
}

function ModeIndicator(props: {
  mode: PromptInputMode
  toolPermissionContext: ToolPermissionContext
  showHint: boolean
  isLoading: boolean
  tasksSelected: boolean
  teamsSelected: boolean
  teammateFooterIndex?: number
  tmuxSelected: boolean
  onOpenTasksDialog?: (taskId?: string) => void
}): JSXElement {
  const modeColor = createMemo(() => getModeColor(props.toolPermissionContext.mode))
  const modeSymbol = createMemo(() => permissionModeSymbol(props.toolPermissionContext.mode))
  const modeTitle = createMemo(() => permissionModeTitle(props.toolPermissionContext.mode))
  const isDefault = createMemo(() => isDefaultMode(props.toolPermissionContext.mode))
  const shortcutDisplay = useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab')

  return (
    <box flexDirection="row" gap={1}>
      <Show when={!isDefault()}>
        <text fg={modeColor()}>
          {modeSymbol()} {modeTitle()}
        </text>
      </Show>

      <Show when={props.showHint && !props.isLoading}>
        <text dimmed>
          <Byline>
            <KeyboardShortcutHint shortcut={shortcutDisplay} action="mode" />
          </Byline>
        </text>
      </Show>
    </box>
  )
}
