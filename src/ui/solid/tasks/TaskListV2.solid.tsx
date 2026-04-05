import { createSignal, createEffect, onCleanup, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useAppState } from '../../../state/AppState.js'
import { isInProcessTeammateTask } from '../../../tasks/InProcessTeammateTask/types.js'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  type AgentColorName,
} from '../../../tools/AgentTool/agentColorManager.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { count } from '../../../utils/array.js'
import { summarizeRecentActivities } from '../../../utils/collapseReadSearch.js'
import { truncateToWidth } from '../../../utils/format.js'
import { isTodoV2Enabled, type Task } from '../../../utils/tasks.js'
import type { Theme } from '../../../utils/theme.js'
import ThemedText from '../../solid/design-system/ThemedText.js'

type Props = {
  tasks: Task[]
  isStandalone?: boolean
}

const RECENT_COMPLETED_TTL_MS = 30_000

function byIdAsc(a: Task, b: Task): number {
  const aNum = parseInt(a.id, 10)
  const bNum = parseInt(b.id, 10)
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum
  }
  return a.id.localeCompare(b.id)
}

function getTaskIcon(
  status: Task['status'],
): { icon: string; color: keyof Theme | undefined } {
  switch (status) {
    case 'completed':
      return { icon: figures.tick, color: 'success' }
    case 'in_progress':
      return { icon: figures.squareSmallFilled, color: 'claude' }
    case 'pending':
      return { icon: figures.squareSmall, color: undefined }
  }
}

export function TaskListV2(props: Props): JSXElement {
  const isStandalone = () => props.isStandalone ?? false
  const teamContext = useAppState((s: any) => s.teamContext)
  const appStateTasks = useAppState((s: any) => s.tasks)
  const [, setForceUpdate] = createSignal(0)
  const { rows, columns } = useTerminalSize()

  const completionTimestamps = new Map<string, number>()
  let previousCompletedIds: Set<string> | null = null
  if (previousCompletedIds === null) {
    previousCompletedIds = new Set(
      props.tasks.filter((t) => t.status === 'completed').map((t) => t.id),
    )
  }
  const maxDisplay = () =>
    rows <= 10 ? 0 : Math.min(10, Math.max(3, rows - 14))

  // Schedule re-render when the next recent completion expires
  createEffect(() => {
    const tasks = props.tasks
    if (completionTimestamps.size === 0) return
    const currentNow = Date.now()
    let earliestExpiry = Infinity
    for (const ts of completionTimestamps.values()) {
      const expiry = ts + RECENT_COMPLETED_TTL_MS
      if (expiry > currentNow && expiry < earliestExpiry) {
        earliestExpiry = expiry
      }
    }
    if (earliestExpiry === Infinity) return
    const timer = setTimeout(
      () => setForceUpdate((n) => n + 1),
      earliestExpiry - currentNow,
    )
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <Show when={isTodoV2Enabled() && props.tasks.length > 0}>
      {(() => {
        const tasks = props.tasks
        const now = Date.now()

        // Update completion timestamps
        const currentCompletedIds = new Set(
          tasks.filter((t) => t.status === 'completed').map((t) => t.id),
        )
        for (const id of currentCompletedIds) {
          if (previousCompletedIds && !previousCompletedIds.has(id)) {
            completionTimestamps.set(id, now)
          }
        }
        for (const id of completionTimestamps.keys()) {
          if (!currentCompletedIds.has(id)) {
            completionTimestamps.delete(id)
          }
        }
        previousCompletedIds = currentCompletedIds

        // Build teammate maps
        const teammateColors: Record<string, keyof Theme> = {}
        if (isAgentSwarmsEnabled() && teamContext()?.teammates) {
          for (const teammate of Object.values(teamContext().teammates)) {
            if ((teammate as any).color) {
              const themeColor =
                AGENT_COLOR_TO_THEME_COLOR[(teammate as any).color as AgentColorName]
              if (themeColor) {
                teammateColors[(teammate as any).name] = themeColor
              }
            }
          }
        }

        const teammateActivity: Record<string, string> = {}
        const activeTeammates = new Set<string>()
        if (isAgentSwarmsEnabled()) {
          for (const bgTask of Object.values(appStateTasks() ?? {})) {
            if (
              isInProcessTeammateTask(bgTask as any) &&
              (bgTask as any).status === 'running'
            ) {
              activeTeammates.add((bgTask as any).identity.agentName)
              activeTeammates.add((bgTask as any).identity.agentId)
              const activities = (bgTask as any).progress?.recentActivities
              const desc =
                (activities && summarizeRecentActivities(activities)) ??
                (bgTask as any).progress?.lastActivity?.activityDescription
              if (desc) {
                teammateActivity[(bgTask as any).identity.agentName] = desc
                teammateActivity[(bgTask as any).identity.agentId] = desc
              }
            }
          }
        }

        const completedCount = count(tasks, (t) => t.status === 'completed')
        const pendingCount = count(tasks, (t) => t.status === 'pending')
        const inProgressCount = tasks.length - completedCount - pendingCount
        const unresolvedTaskIds = new Set(
          tasks.filter((t) => t.status !== 'completed').map((t) => t.id),
        )

        const needsTruncation = tasks.length > maxDisplay()
        let visibleTasks: Task[]
        let hiddenTasks: Task[]

        if (needsTruncation) {
          const recentCompleted: Task[] = []
          const olderCompleted: Task[] = []
          for (const task of tasks.filter((t) => t.status === 'completed')) {
            const ts = completionTimestamps.get(task.id)
            if (ts && now - ts < RECENT_COMPLETED_TTL_MS) {
              recentCompleted.push(task)
            } else {
              olderCompleted.push(task)
            }
          }
          recentCompleted.sort(byIdAsc)
          olderCompleted.sort(byIdAsc)
          const inProgress = tasks
            .filter((t) => t.status === 'in_progress')
            .sort(byIdAsc)
          const pending = tasks
            .filter((t) => t.status === 'pending')
            .sort((a, b) => {
              const aBlocked = a.blockedBy.some((id) =>
                unresolvedTaskIds.has(id),
              )
              const bBlocked = b.blockedBy.some((id) =>
                unresolvedTaskIds.has(id),
              )
              if (aBlocked !== bBlocked) return aBlocked ? 1 : -1
              return byIdAsc(a, b)
            })
          const prioritized = [
            ...recentCompleted,
            ...inProgress,
            ...pending,
            ...olderCompleted,
          ]
          visibleTasks = prioritized.slice(0, maxDisplay())
          hiddenTasks = prioritized.slice(maxDisplay())
        } else {
          visibleTasks = [...tasks].sort(byIdAsc)
          hiddenTasks = []
        }

        let hiddenSummary = ''
        if (hiddenTasks.length > 0) {
          const parts: string[] = []
          const hiddenPending = count(hiddenTasks, (t) => t.status === 'pending')
          const hiddenInProgress = count(
            hiddenTasks,
            (t) => t.status === 'in_progress',
          )
          const hiddenCompleted = count(
            hiddenTasks,
            (t) => t.status === 'completed',
          )
          if (hiddenInProgress > 0) parts.push(`${hiddenInProgress} in progress`)
          if (hiddenPending > 0) parts.push(`${hiddenPending} pending`)
          if (hiddenCompleted > 0) parts.push(`${hiddenCompleted} completed`)
          hiddenSummary = ` … +${parts.join(', ')}`
        }

        const content = (
          <>
            <For each={visibleTasks}>
              {(task) => (
                <TaskItem
                  task={task}
                  ownerColor={
                    task.owner ? teammateColors[task.owner] : undefined
                  }
                  openBlockers={task.blockedBy.filter((id) =>
                    unresolvedTaskIds.has(id),
                  )}
                  activity={
                    task.owner ? teammateActivity[task.owner] : undefined
                  }
                  ownerActive={
                    task.owner ? activeTeammates.has(task.owner) : false
                  }
                  columns={columns}
                />
              )}
            </For>
            <Show when={maxDisplay() > 0 && hiddenSummary}>
              <text dimmed>{hiddenSummary}</text>
            </Show>
          </>
        )

        return (
          <Show
            when={isStandalone()}
            fallback={<box flexDirection="column">{content}</box>}
          >
            <box flexDirection="column" marginTop={1} marginLeft={2}>
              <box>
                <text dimmed>
                  <text><b>{tasks.length}</b></text>
                  {' tasks ('}
                  <text><b>{completedCount}</b></text>
                  {' done, '}
                  <Show when={inProgressCount > 0}>
                    <text><b>{inProgressCount}</b></text>
                    {' in progress, '}
                  </Show>
                  <text><b>{pendingCount}</b></text>
                  {' open)'}
                </text>
              </box>
              {content}
            </box>
          </Show>
        )
      })()}
    </Show>
  )
}

type TaskItemProps = {
  task: Task
  ownerColor?: keyof Theme
  openBlockers: string[]
  activity?: string
  ownerActive: boolean
  columns: number
}

function TaskItem(props: TaskItemProps): JSXElement {
  const isCompleted = () => props.task.status === 'completed'
  const isInProgress = () => props.task.status === 'in_progress'
  const isBlocked = () => props.openBlockers.length > 0

  const iconInfo = () => getTaskIcon(props.task.status)
  const showActivity = () =>
    isInProgress() && !isBlocked() && props.activity

  const showOwner = () =>
    props.columns >= 60 && props.task.owner && props.ownerActive
  const ownerWidth = () =>
    showOwner() ? stringWidth(` (@${props.task.owner})`) : 0
  const maxSubjectWidth = () =>
    Math.max(15, props.columns - 15 - ownerWidth())
  const displaySubject = () =>
    truncateToWidth(props.task.subject, maxSubjectWidth())
  const maxActivityWidth = () => Math.max(15, props.columns - 15)
  const displayActivity = () =>
    props.activity
      ? truncateToWidth(props.activity, maxActivityWidth())
      : undefined

  return (
    <box flexDirection="column">
      <box>
        <text fg={iconInfo().color}>{iconInfo().icon} </text>
        <text
          bold={isInProgress()}
          strikethrough={isCompleted()}
          dimmed={isCompleted() || isBlocked()}
        >
          {displaySubject()}
        </text>
        <Show when={showOwner()}>
          <text dimmed>
            {' ('}
            <Show when={props.ownerColor} fallback={`@${props.task.owner}`}>
              <ThemedText color={props.ownerColor!}>
                @{props.task.owner}
              </ThemedText>
            </Show>
            {')'}
          </text>
        </Show>
        <Show when={isBlocked()}>
          <text dimmed>
            {' '}
            {figures.pointerSmall} blocked by{' '}
            {[...props.openBlockers]
              .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
              .map((id) => `#${id}`)
              .join(', ')}
          </text>
        </Show>
      </box>
      <Show when={showActivity() && displayActivity()}>
        <box>
          <text dimmed>
            {'  '}
            {displayActivity()}
            {figures.ellipsis}
          </text>
        </box>
      </Show>
    </box>
  )
}
