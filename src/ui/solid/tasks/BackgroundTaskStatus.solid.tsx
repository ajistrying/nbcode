import { createSignal, createMemo, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useAppState, useSetAppState } from '../../../state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from '../../../state/teammateViewHelpers.js'
import { isPanelAgentTask } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getPillLabel, pillNeedsCta } from '../../../tasks/pillLabel.js'
import {
  type BackgroundTaskState,
  isBackgroundTask,
  type TaskState,
} from '../../../tasks/types.js'
import { calculateHorizontalScrollWindow } from '../../../utils/horizontalScroll.js'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '../../../tools/AgentTool/agentColorManager.js'
import type { Theme } from '../../../utils/theme.js'
import { KeyboardShortcutHint } from '../../solid/design-system/KeyboardShortcutHint.js'
import { shouldHideTasksFooter } from './taskStatusUtils.js'

type Props = {
  tasksSelected: boolean
  isViewingTeammate?: boolean
  teammateFooterIndex?: number
  isLeaderIdle?: boolean
  onOpenDialog?: (taskId?: string) => void
}

function getAgentThemeColor(
  colorName: string | undefined,
): keyof Theme | undefined {
  if (!colorName) return undefined
  if (AGENT_COLORS.includes(colorName as AgentColorName)) {
    return AGENT_COLOR_TO_THEME_COLOR[colorName as AgentColorName]
  }
  return undefined
}

export function BackgroundTaskStatus(props: Props): JSXElement {
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const tasks = useAppState((s: any) => s.tasks)
  const viewingAgentTaskId = useAppState((s: any) => s.viewingAgentTaskId)
  const teammateFooterIndex = () => props.teammateFooterIndex ?? 0
  const isLeaderIdle = () => props.isLeaderIdle ?? false

  const runningTasks = createMemo(() =>
    (Object.values(tasks() ?? {}) as TaskState[]).filter(
      (t) =>
        isBackgroundTask(t) &&
        !('external' === 'ant' && isPanelAgentTask(t)),
    ),
  )

  const expandedView = useAppState((s: any) => s.expandedView)
  const showSpinnerTree = () => expandedView() === 'teammates'
  const allTeammates = () =>
    !showSpinnerTree() &&
    runningTasks().length > 0 &&
    runningTasks().every((t) => t.type === 'in_process_teammate')

  const teammateEntries = createMemo(() =>
    runningTasks()
      .filter(
        (t): t is BackgroundTaskState & { type: 'in_process_teammate' } =>
          t.type === 'in_process_teammate',
      )
      .sort((a, b) =>
        a.identity.agentName.localeCompare(b.identity.agentName),
      ),
  )

  const allPills = createMemo(() => {
    const mainPill = {
      name: 'main',
      color: undefined as keyof Theme | undefined,
      isIdle: isLeaderIdle(),
      taskId: undefined as string | undefined,
    }
    const teammatePills = teammateEntries().map((t) => ({
      name: t.identity.agentName,
      color: getAgentThemeColor(t.identity.color),
      isIdle: t.isIdle,
      taskId: t.id,
    }))
    if (!props.tasksSelected) {
      teammatePills.sort((a, b) => {
        if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1
        return 0
      })
    }
    return [mainPill, ...teammatePills].map((pill, i) => ({
      ...pill,
      idx: i,
    }))
  })

  const pillWidths = createMemo(() =>
    allPills().map((pill, i) => {
      const pillText = `@${pill.name}`
      return stringWidth(pillText) + (i > 0 ? 1 : 0)
    }),
  )

  return (
    <Show
      when={
        !shouldHideTasksFooter(tasks() ?? {}, showSpinnerTree()) &&
        runningTasks().length > 0
      }
    >
      <Show
        when={allTeammates() || (!showSpinnerTree() && props.isViewingTeammate)}
        fallback={
          <>
            <SummaryPill selected={props.tasksSelected} onClick={props.onOpenDialog}>
              {getPillLabel(runningTasks())}
            </SummaryPill>
            <Show when={pillNeedsCta(runningTasks())}>
              <text dimmed> · {figures.arrowDown} to view</text>
            </Show>
          </>
        }
      >
        <TeammatePills
          allPills={allPills()}
          pillWidths={pillWidths()}
          tasksSelected={props.tasksSelected}
          teammateFooterIndex={teammateFooterIndex()}
          viewingAgentTaskId={viewingAgentTaskId()}
          teammateEntries={teammateEntries()}
          columns={columns}
          setAppState={setAppState}
        />
      </Show>
    </Show>
  )
}

function TeammatePills(props: {
  allPills: any[]
  pillWidths: number[]
  tasksSelected: boolean
  teammateFooterIndex: number
  viewingAgentTaskId: string | undefined
  teammateEntries: any[]
  columns: number
  setAppState: any
}): JSXElement {
  const selectedIdx = () =>
    props.tasksSelected ? props.teammateFooterIndex : -1
  const viewedIdx = () =>
    props.viewingAgentTaskId
      ? props.teammateEntries.findIndex(
          (t: any) => t.id === props.viewingAgentTaskId,
        ) + 1
      : 0

  const ARROW_WIDTH = 2
  const HINT_WIDTH = 20
  const PADDING = 4
  const availableWidth = () =>
    Math.max(20, props.columns - HINT_WIDTH - PADDING)

  const scrollWindow = () =>
    calculateHorizontalScrollWindow(
      props.pillWidths,
      availableWidth(),
      ARROW_WIDTH,
      selectedIdx() >= 0 ? selectedIdx() : 0,
    )

  const visiblePills = () =>
    props.allPills.slice(scrollWindow().startIndex, scrollWindow().endIndex)

  return (
    <>
      <Show when={scrollWindow().showLeftArrow}>
        <text dimmed>{figures.arrowLeft} </text>
      </Show>
      <For each={visiblePills()}>
        {(pill, i) => (
          <>
            <Show when={i() > 0}>
              <text> </text>
            </Show>
            <AgentPill
              name={pill.name}
              color={pill.color}
              isSelected={selectedIdx() === pill.idx}
              isViewed={viewedIdx() === pill.idx}
              isIdle={pill.isIdle}
              onClick={() =>
                pill.taskId
                  ? enterTeammateView(pill.taskId, props.setAppState)
                  : exitTeammateView(props.setAppState)
              }
            />
          </>
        )}
      </For>
      <Show when={scrollWindow().showRightArrow}>
        <text dimmed> {figures.arrowRight}</text>
      </Show>
      <text dimmed>
        {' · '}
        <KeyboardShortcutHint shortcut="shift + ↓" action="expand" />
      </text>
    </>
  )
}

type AgentPillProps = {
  name: string
  color?: keyof Theme
  isSelected: boolean
  isViewed: boolean
  isIdle: boolean
  onClick?: () => void
}

function AgentPill(props: AgentPillProps): JSXElement {
  const [hover, setHover] = createSignal(false)
  const highlighted = () => props.isSelected || hover()

  const label = () => {
    if (highlighted()) {
      return props.color ? (
        <text bg={props.color} fg="inverseText" bold={props.isViewed}>
          @{props.name}
        </text>
      ) : (
        <text fg="background" inverse bold={props.isViewed}>
          @{props.name}
        </text>
      )
    }
    if (props.isIdle) {
      return (
        <text dimmed bold={props.isViewed}>
          @{props.name}
        </text>
      )
    }
    if (props.isViewed) {
      return (
        <text fg={props.color} bold>
          @{props.name}
        </text>
      )
    }
    return (
      <text fg={props.color} dimmed={!props.color}>
        @{props.name}
      </text>
    )
  }

  return (
    <Show when={props.onClick} fallback={label()}>
      <box
        onClick={props.onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {label()}
      </box>
    </Show>
  )
}

function SummaryPill(props: {
  selected: boolean
  onClick?: () => void
  children: any
}): JSXElement {
  const [hover, setHover] = createSignal(false)
  const label = () => (
    <text fg="background" inverse={props.selected || hover()}>
      {props.children}
    </text>
  )

  return (
    <Show when={props.onClick} fallback={label()}>
      <box
        onClick={props.onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {label()}
      </box>
    </Show>
  )
}
