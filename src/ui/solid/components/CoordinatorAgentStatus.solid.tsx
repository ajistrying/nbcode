/**
 * CoordinatorAgentStatus — SolidJS port of src/components/CoordinatorAgentStatus.tsx
 *
 * Renders the steerable list of background agents below the prompt input footer.
 */
import figures from 'figures'
import { createSignal, createEffect, createMemo, onCleanup, Show, For, type JSX } from 'solid-js'
import { BLACK_CIRCLE, PAUSE_ICON, PLAY_ICON } from '../../../constants/figures.js'
import { formatDuration, formatNumber } from '../../../utils/format.js'
import { isTerminalStatus } from '../../components/tasks/taskStatusUtils.js'
import type { LocalAgentTaskState } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'

// Re-export for consumers
export { getVisibleAgentTasks } from '../../../components/CoordinatorAgentStatus.js'

type MainLineProps = {
  isSelected: boolean
  isViewed: boolean
  onClick?: () => void
}

function MainLine(props: MainLineProps): JSX.Element {
  const [hover, setHover] = createSignal(false)

  const prefix = () => (props.isSelected || hover() ? figures.pointer + ' ' : '  ')
  const bullet = () => (props.isViewed ? BLACK_CIRCLE : figures.circle)
  const dim = () => !props.isSelected && !props.isViewed && !hover()

  return (
    <box onClick={props.onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <text dimmed={dim()}>
        <Show when={props.isViewed}>
          <b>
            {prefix()}
            {bullet()} main
          </b>
        </Show>
        <Show when={!props.isViewed}>
          {prefix()}
          {bullet()} main
        </Show>
      </text>
    </box>
  )
}

type AgentLineProps = {
  task: LocalAgentTaskState
  name?: string
  isSelected?: boolean
  isViewed?: boolean
  onClick?: () => void
  columns: number
}

function AgentLine(props: AgentLineProps): JSX.Element {
  const [hover, setHover] = createSignal(false)

  const isRunning = () => !isTerminalStatus(props.task.status)

  const elapsed = () => {
    const pausedMs = props.task.totalPausedMs ?? 0
    const elapsedMs = Math.max(
      0,
      isRunning()
        ? Date.now() - props.task.startTime - pausedMs
        : (props.task.endTime ?? props.task.startTime) - props.task.startTime - pausedMs,
    )
    return formatDuration(elapsedMs)
  }

  const tokenText = () => {
    const tokenCount = props.task.progress?.tokenCount
    const lastActivity = props.task.progress?.lastActivity
    const arrow = lastActivity ? figures.arrowDown : figures.arrowUp
    return tokenCount !== undefined && tokenCount > 0 ? ` \u00B7 ${arrow} ${formatNumber(tokenCount)} tokens` : ''
  }

  const queuedText = () => {
    const count = props.task.pendingMessages.length
    return count > 0 ? ` \u00B7 ${count} queued` : ''
  }

  const displayDescription = () => props.task.progress?.summary || props.task.description
  const highlighted = () => props.isSelected || hover()
  const prefix = () => (highlighted() ? figures.pointer + ' ' : '  ')
  const bullet = () => (props.isViewed ? BLACK_CIRCLE : figures.circle)
  const dim = () => !highlighted() && !props.isViewed
  const sep = () => (isRunning() ? PLAY_ICON : PAUSE_ICON)
  const namePart = () => (props.name ? `${props.name}: ` : '')
  const hintPart = () =>
    props.isSelected && !props.isViewed ? ` \u00B7 x to ${isRunning() ? 'stop' : 'clear'}` : ''

  const line = () => (
    <text dimmed={dim()}>
      <Show when={props.isViewed}>
        <b>
          {prefix()}
          {bullet()} {namePart()}
          {displayDescription()} {sep()} {elapsed()}
          {tokenText()}
        </b>
      </Show>
      <Show when={!props.isViewed}>
        {prefix()}
        {bullet()} {namePart()}
        {displayDescription()} {sep()} {elapsed()}
        {tokenText()}
        <Show when={props.task.pendingMessages.length > 0}>
          <text fg="yellow">{queuedText()}</text>
        </Show>
        <Show when={!!hintPart()}>
          <text dimmed>{hintPart()}</text>
        </Show>
      </Show>
    </text>
  )

  return (
    <Show when={props.onClick} fallback={line()}>
      <box onClick={props.onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {line()}
      </box>
    </Show>
  )
}

type CoordinatorTaskPanelProps = {
  tasks: Record<string, any>
  viewingAgentTaskId: string | undefined
  agentNameRegistry: Map<string, string>
  coordinatorTaskIndex: number
  tasksSelected: boolean
  columns: number
  setAppState: (updater: (prev: any) => any) => void
  enterTeammateView: (id: string) => void
  exitTeammateView: () => void
}

export function CoordinatorTaskPanel(props: CoordinatorTaskPanelProps): JSX.Element | null {
  const { getVisibleAgentTasks } = require('../../../components/CoordinatorAgentStatus.js')
  const { isPanelAgentTask } = require('../../../tasks/LocalAgentTask/LocalAgentTask.js')
  const { evictTerminalTask } = require('../../../utils/task/framework.js')

  const selectedIndex = () => (props.tasksSelected ? props.coordinatorTaskIndex : undefined)
  const visibleTasks = () => getVisibleAgentTasks(props.tasks) as LocalAgentTaskState[]
  const hasTasks = () => Object.values(props.tasks).some(isPanelAgentTask)

  // 1s tick for elapsed time + evict tasks past their deadline
  const [, setTick] = createSignal(0)
  createEffect(() => {
    if (!hasTasks()) return
    const interval = setInterval(() => {
      const now = Date.now()
      for (const t of Object.values(props.tasks)) {
        if (isPanelAgentTask(t) && ((t as any).evictAfter ?? Infinity) <= now) {
          evictTerminalTask((t as any).id, props.setAppState)
        }
      }
      setTick((prev: number) => prev + 1)
    }, 1000)
    onCleanup(() => clearInterval(interval))
  })

  const nameByAgentId = createMemo(() => {
    const inv = new Map<string, string>()
    for (const [n, id] of props.agentNameRegistry) inv.set(id, n)
    return inv
  })

  return (
    <Show when={visibleTasks().length > 0}>
      <box flexDirection="column" marginTop={1}>
        <MainLine
          isSelected={selectedIndex() === 0}
          isViewed={props.viewingAgentTaskId === undefined}
          onClick={() => props.exitTeammateView()}
        />
        <For each={visibleTasks()}>
          {(task, i) => (
            <AgentLine
              task={task}
              name={nameByAgentId().get(task.id)}
              isSelected={selectedIndex() === i() + 1}
              isViewed={props.viewingAgentTaskId === task.id}
              onClick={() => props.enterTeammateView(task.id)}
              columns={props.columns}
            />
          )}
        </For>
      </box>
    </Show>
  )
}
