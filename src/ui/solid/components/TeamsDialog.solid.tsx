import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  Show,
  For,
  type JSXElement,
} from 'solid-js'
import { randomUUID } from 'crypto'
import figures from 'figures'
import { useRegisterOverlay } from '../../../context/overlayContext.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { type AppState, useAppState, useSetAppState } from '../../../state/AppState.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'
import { AGENT_COLOR_TO_THEME_COLOR } from '../../../tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../../utils/debug.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { truncateToWidth } from '../../../utils/format.js'
import {
  getNextPermissionMode,
} from '../../../utils/permissions/getNextPermissionMode.js'
import {
  getModeColor,
  type PermissionMode,
  permissionModeFromString,
  permissionModeSymbol,
} from '../../../utils/permissions/PermissionMode.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import {
  IT2_COMMAND,
  isInsideTmuxSync,
} from '../../../utils/swarm/backends/detection.js'
import {
  ensureBackendsRegistered,
  getBackendByType,
  getCachedBackend,
} from '../../../utils/swarm/backends/registry.js'
import type { PaneBackendType } from '../../../utils/swarm/backends/types.js'
import { getSwarmSocketName, TMUX_COMMAND } from '../../../utils/swarm/constants.js'
import {
  addHiddenPaneId,
  removeHiddenPaneId,
  removeMemberFromTeam,
  setMemberMode,
  setMultipleMemberModes,
} from '../../../utils/swarm/teamHelpers.js'
import { listTasks, type Task, unassignTeammateTasks } from '../../../utils/tasks.js'
import {
  getTeammateStatuses,
  type TeammateStatus,
  type TeamSummary,
} from '../../../utils/teamDiscovery.js'
import {
  createModeSetRequestMessage,
  sendShutdownRequestToMailbox,
  writeToMailbox,
} from '../../../utils/teammateMailbox.js'
import { Dialog } from '../design-system/Dialog.js'
import ThemedText from '../design-system/ThemedText.js'

type Props = {
  initialTeams?: TeamSummary[]
  onDone: () => void
}

type DialogLevel =
  | { type: 'teammateList'; teamName: string }
  | { type: 'teammateDetail'; teamName: string; memberName: string }

// -- Helper functions (unchanged from React version) --

function cycleTeammateMode(
  teammate: TeammateStatus,
  teamName: string,
  isBypassAvailable: boolean,
) {
  const ctx = {
    ...getEmptyToolPermissionContext(),
    mode: permissionModeFromString(teammate.permissionMode),
    isBypassPermissionsModeAvailable: isBypassAvailable,
  }
  const nextMode = getNextPermissionMode(ctx, undefined)
  setMemberMode(teamName, teammate.name, nextMode)
  if (teammate.tmuxPaneId) {
    const message = createModeSetRequestMessage(nextMode)
    void writeToMailbox(teammate.name, teamName, message)
  }
}

function cycleAllTeammateModes(
  statuses: TeammateStatus[],
  teamName: string,
  isBypassAvailable: boolean,
) {
  if (statuses.length === 0) return
  const first = statuses[0]!
  const ctx = {
    ...getEmptyToolPermissionContext(),
    mode: permissionModeFromString(first.permissionMode),
    isBypassPermissionsModeAvailable: isBypassAvailable,
  }
  const nextMode = getNextPermissionMode(ctx, undefined)
  const modeMap: Record<string, PermissionMode> = {}
  for (const t of statuses) {
    modeMap[t.name] = nextMode
  }
  setMultipleMemberModes(teamName, modeMap)
  for (const t of statuses) {
    if (t.tmuxPaneId) {
      void writeToMailbox(t.name, teamName, createModeSetRequestMessage(nextMode))
    }
  }
}

async function killTeammate(
  paneId: string | undefined,
  backendType: PaneBackendType | undefined,
  teamName: string,
  agentId: string | undefined,
  memberName: string,
  setAppState: (fn: (prev: AppState) => AppState) => void,
) {
  if (paneId && backendType) {
    const backend = getBackendByType(backendType)
    await backend?.killPane(paneId)
  }
  removeMemberFromTeam(teamName, memberName)
  if (agentId) {
    void unassignTeammateTasks(agentId)
  }
}

async function viewTeammateOutput(
  paneId: string | undefined,
  backendType: PaneBackendType | undefined,
) {
  if (!paneId || !backendType) return
  const backend = getBackendByType(backendType)
  await backend?.selectPane(paneId)
}

async function hideTeammate(teammate: TeammateStatus, teamName: string) {
  if (!teammate.tmuxPaneId || !teammate.backendType) return
  const backend = getBackendByType(teammate.backendType)
  await backend?.hidePane?.(teammate.tmuxPaneId)
  addHiddenPaneId(teamName, teammate.tmuxPaneId)
}

async function showTeammate(teammate: TeammateStatus, teamName: string) {
  if (!teammate.tmuxPaneId || !teammate.backendType) return
  const backend = getBackendByType(teammate.backendType)
  await backend?.showPane?.(teammate.tmuxPaneId)
  removeHiddenPaneId(teamName, teammate.tmuxPaneId)
}

async function toggleTeammateVisibility(teammate: TeammateStatus, teamName: string) {
  if (teammate.isHidden) {
    await showTeammate(teammate, teamName)
  } else {
    await hideTeammate(teammate, teamName)
  }
}

/**
 * Dialog for viewing teammates in the current team
 */
export function TeamsDialog(props: Props): JSXElement {
  useRegisterOverlay('teams-dialog')

  const setAppState = useSetAppState()
  const firstTeamName = props.initialTeams?.[0]?.name ?? ''

  const [dialogLevel, setDialogLevel] = createSignal<DialogLevel>({
    type: 'teammateList',
    teamName: firstTeamName,
  })
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [refreshKey, setRefreshKey] = createSignal(0)

  const teammateStatuses = createMemo(() => {
    // Track refreshKey for reactivity
    const _key = refreshKey()
    return getTeammateStatuses(dialogLevel().teamName)
  })

  // Periodic refresh
  let refreshInterval: ReturnType<typeof setInterval> | undefined
  refreshInterval = setInterval(() => setRefreshKey(k => k + 1), 1000)
  onCleanup(() => {
    if (refreshInterval) clearInterval(refreshInterval)
  })

  const currentTeammate = createMemo(() => {
    const level = dialogLevel()
    if (level.type !== 'teammateDetail') return null
    return teammateStatuses().find(t => t.name === level.memberName) ?? null
  })

  const isBypassAvailable = useAppState(
    (s: any) => s.toolPermissionContext.isBypassPermissionsModeAvailable,
  )

  function goBackToList() {
    setDialogLevel({ type: 'teammateList', teamName: dialogLevel().teamName })
    setSelectedIndex(0)
  }

  function getMaxIndex(): number {
    const level = dialogLevel()
    if (level.type === 'teammateList') {
      return Math.max(0, teammateStatuses().length - 1)
    }
    return 0
  }

  function handleCycleMode() {
    const level = dialogLevel()
    const current = currentTeammate()
    if (level.type === 'teammateDetail' && current) {
      cycleTeammateMode(current, level.teamName, isBypassAvailable)
      setRefreshKey(k => k + 1)
    } else if (level.type === 'teammateList' && teammateStatuses().length > 0) {
      cycleAllTeammateModes(teammateStatuses(), level.teamName, isBypassAvailable)
      setRefreshKey(k => k + 1)
    }
  }

  useKeybindings(
    { 'confirm:cycleMode': handleCycleMode },
    { context: 'Confirmation' },
  )

  // Keyboard navigation
  // In Solid, we'd register input handlers through OpenTUI's input system
  // For now, use keybindings for the critical actions
  useKeybindings(
    {
      'confirm:up': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'confirm:down': () => setSelectedIndex(prev => Math.min(getMaxIndex(), prev + 1)),
      'confirm:yes': () => {
        const level = dialogLevel()
        if (level.type === 'teammateList' && teammateStatuses()[selectedIndex()]) {
          setDialogLevel({
            type: 'teammateDetail',
            teamName: level.teamName,
            memberName: teammateStatuses()[selectedIndex()]!.name,
          })
        } else if (level.type === 'teammateDetail' && currentTeammate()) {
          void viewTeammateOutput(
            currentTeammate()!.tmuxPaneId,
            currentTeammate()!.backendType,
          )
          props.onDone()
        }
      },
      'confirm:no': () => {
        const level = dialogLevel()
        if (level.type === 'teammateDetail') {
          goBackToList()
        } else {
          props.onDone()
        }
      },
    },
    { context: 'Confirmation' },
  )

  const title = createMemo(() => {
    const level = dialogLevel()
    if (level.type === 'teammateDetail') {
      return `${level.memberName} - Details`
    }
    return `Team: ${level.teamName}`
  })

  return (
    <Dialog title={title()} onCancel={props.onDone}>
      <Show when={dialogLevel().type === 'teammateList'}>
        <box flexDirection="column">
          <Show when={teammateStatuses().length === 0}>
            <text dimmed>No teammates in this team.</text>
          </Show>
          <For each={teammateStatuses()}>
            {(teammate, i) => {
              const isSelected = () => i() === selectedIndex()
              const modeColor = getModeColor(
                permissionModeFromString(teammate.permissionMode),
              )
              const modeSymbol = permissionModeSymbol(
                permissionModeFromString(teammate.permissionMode),
              )
              const statusIcon = teammate.status === 'running' ? figures.play : figures.bullet
              const color =
                teammate.color && AGENT_COLOR_TO_THEME_COLOR[teammate.color as any]
                  ? AGENT_COLOR_TO_THEME_COLOR[teammate.color as any]
                  : undefined

              return (
                <box flexDirection="row" gap={1}>
                  <text>{isSelected() ? figures.pointer : ' '}</text>
                  <text fg={color as any}>
                    {statusIcon} {teammate.name}
                  </text>
                  <text fg={modeColor}>{modeSymbol}</text>
                  <Show when={teammate.currentTask}>
                    <text dimmed>{truncateToWidth(teammate.currentTask ?? '', 40)}</text>
                  </Show>
                  <Show when={teammate.isHidden}>
                    <text dimmed>(hidden)</text>
                  </Show>
                </box>
              )
            }}
          </For>
          <text dimmed>
            {figures.arrowUp}/{figures.arrowDown} navigate {figures.middleDot} Enter view{' '}
            {figures.middleDot} k kill {figures.middleDot} s shutdown {figures.middleDot}{' '}
            shift+tab mode
          </text>
        </box>
      </Show>

      <Show when={dialogLevel().type === 'teammateDetail' && currentTeammate()}>
        <box flexDirection="column" gap={1}>
          <text>
            <b>{currentTeammate()!.name}</b>
          </text>
          <text>
            Status: {currentTeammate()!.status === 'running' ? 'Running' : 'Idle'}
          </text>
          <text>
            Mode:{' '}
            <text
              fg={getModeColor(
                permissionModeFromString(currentTeammate()!.permissionMode),
              )}
            >
              {permissionModeSymbol(
                permissionModeFromString(currentTeammate()!.permissionMode),
              )}
            </text>
          </text>
          <Show when={currentTeammate()!.currentTask}>
            <text>Task: {currentTeammate()!.currentTask}</text>
          </Show>
          <text dimmed>
            Enter to view output {figures.middleDot} Esc to go back {figures.middleDot}{' '}
            shift+tab mode
          </text>
        </box>
      </Show>
    </Dialog>
  )
}
