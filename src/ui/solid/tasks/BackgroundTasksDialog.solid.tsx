import { createSignal, createMemo, createEffect, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useAppState, useSetAppState } from '../../../state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from '../../../state/teammateViewHelpers.js'
import type { ToolUseContext } from '../../../Tool.js'
import { InProcessTeammateTask } from '../../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import { LocalAgentTask } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import { LocalShellTask } from '../../../tasks/LocalShellTask/LocalShellTask.js'
import {
  RemoteAgentTask,
} from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import {
  DreamTask,
} from '../../../tasks/DreamTask/DreamTask.js'
import {
  isBackgroundTask,
  type TaskState,
} from '../../../tasks/types.js'
import { intersperse } from '../../../utils/array.js'
import { TEAM_LEAD_NAME } from '../../../utils/swarm/constants.js'
import { stopUltraplan } from '../../../commands/ultraplan.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { useRegisterOverlay } from '../../../context/overlayContext.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { count } from '../../../utils/array.js'
import { Byline } from '../../solid/design-system/Byline.js'
import { Dialog } from '../../solid/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../solid/design-system/KeyboardShortcutHint.js'
import { BackgroundTask as BackgroundTaskComponent } from './BackgroundTask.js'
import { ShellDetailDialog } from './ShellDetailDialog.solid.js'

type ViewState = { mode: 'list' } | { mode: 'detail'; itemId: string }

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  toolUseContext: ToolUseContext
  initialDetailTaskId?: string
}

function getSelectableBackgroundTasks(
  tasks: Record<string, TaskState> | undefined,
  foregroundedTaskId: string | undefined,
): TaskState[] {
  const backgroundTasks = Object.values(tasks ?? {}).filter(isBackgroundTask)
  return backgroundTasks.filter(
    (task) => !(task.type === 'local_agent' && task.id === foregroundedTaskId),
  )
}

function toListItem(task: any): any {
  switch (task.type) {
    case 'local_bash':
      return {
        id: task.id,
        type: 'local_bash',
        label: task.kind === 'monitor' ? task.description : task.command,
        status: task.status,
        task,
      }
    case 'remote_agent':
      return {
        id: task.id,
        type: 'remote_agent',
        label: task.title,
        status: task.status,
        task,
      }
    case 'local_agent':
      return {
        id: task.id,
        type: 'local_agent',
        label: task.description,
        status: task.status,
        task,
      }
    case 'in_process_teammate':
      return {
        id: task.id,
        type: 'in_process_teammate',
        label: `@${task.identity.agentName}`,
        status: task.status,
        task,
      }
    case 'dream':
      return {
        id: task.id,
        type: 'dream',
        label: task.description,
        status: task.status,
        task,
      }
    default:
      return {
        id: task.id,
        type: task.type,
        label: task.description ?? task.id,
        status: task.status,
        task,
      }
  }
}

export function BackgroundTasksDialog(props: Props): JSXElement {
  const tasks = useAppState((s: any) => s.tasks)
  const foregroundedTaskId = useAppState((s: any) => s.foregroundedTaskId)
  const showSpinnerTree = () =>
    useAppState((s: any) => s.expandedView)() === 'teammates'
  const setAppState = useSetAppState()
  const killAgentsShortcut = useShortcutDisplay(
    'chat:killAgents',
    'Chat',
    'ctrl+x ctrl+k',
  )
  const typedTasks = () => tasks() as Record<string, TaskState> | undefined

  let skippedListOnMount = false

  const [viewState, setViewState] = createSignal<ViewState>(() => {
    if (props.initialDetailTaskId) {
      skippedListOnMount = true
      return { mode: 'detail', itemId: props.initialDetailTaskId }
    }
    const allItems = getSelectableBackgroundTasks(
      typedTasks(),
      foregroundedTaskId(),
    )
    if (allItems.length === 1) {
      skippedListOnMount = true
      return { mode: 'detail', itemId: allItems[0]!.id }
    }
    return { mode: 'list' }
  })
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  useRegisterOverlay('background-tasks-dialog')

  const categorized = createMemo(() => {
    const backgroundTasks = Object.values(typedTasks() ?? {}).filter(
      isBackgroundTask,
    )
    const allItems = backgroundTasks.map(toListItem)
    const sorted = allItems.sort((a: any, b: any) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      const aTime = 'task' in a ? a.task.startTime : 0
      const bTime = 'task' in b ? b.task.startTime : 0
      return bTime - aTime
    })
    const bash = sorted.filter((item: any) => item.type === 'local_bash')
    const remote = sorted.filter((item: any) => item.type === 'remote_agent')
    const agent = sorted.filter(
      (item: any) =>
        item.type === 'local_agent' && item.id !== foregroundedTaskId(),
    )
    const teammates = showSpinnerTree()
      ? []
      : sorted.filter((item: any) => item.type === 'in_process_teammate')
    const leaderItem =
      teammates.length > 0
        ? [
            {
              id: '__leader__',
              type: 'leader',
              label: `@${TEAM_LEAD_NAME}`,
              status: 'running',
            },
          ]
        : []
    return {
      bashTasks: bash,
      remoteSessions: remote,
      agentTasks: agent,
      teammateTasks: [...leaderItem, ...teammates],
      allSelectableItems: [
        ...leaderItem,
        ...teammates,
        ...bash,
        ...remote,
        ...agent,
      ],
    }
  })

  const allSelectableItems = () => categorized().allSelectableItems
  const currentSelection = () => allSelectableItems()[selectedIndex()] ?? null

  useKeybindings(
    {
      'confirm:previous': () =>
        setSelectedIndex((prev) => Math.max(0, prev - 1)),
      'confirm:next': () =>
        setSelectedIndex((prev) =>
          Math.min(allSelectableItems().length - 1, prev + 1),
        ),
      'confirm:yes': () => {
        const current = allSelectableItems()[selectedIndex()]
        if (current) {
          if (current.type === 'leader') {
            exitTeammateView(setAppState)
            props.onDone('Viewing leader', { display: 'system' })
          } else {
            setViewState({ mode: 'detail', itemId: current.id })
          }
        }
      },
    },
    { context: 'Confirmation', get isActive() { return viewState().mode === 'list' } },
  )

  async function killShellTask(taskId: string): Promise<void> {
    await LocalShellTask.kill(taskId, setAppState)
  }

  async function killAgentTask(taskId: string): Promise<void> {
    await LocalAgentTask.kill(taskId, setAppState)
  }

  async function killTeammateTask(taskId: string): Promise<void> {
    await InProcessTeammateTask.kill(taskId, setAppState)
  }

  async function killDreamTask(taskId: string): Promise<void> {
    await DreamTask.kill(taskId, setAppState)
  }

  async function killRemoteAgentTask(taskId: string): Promise<void> {
    await RemoteAgentTask.kill(taskId, setAppState)
  }

  createEffect(() => {
    if (viewState().mode !== 'list') {
      const task = (typedTasks() ?? {})[
        (viewState() as { mode: 'detail'; itemId: string }).itemId
      ]
      if (!task || !isBackgroundTask(task)) {
        if (skippedListOnMount) {
          props.onDone('Background tasks dialog dismissed', {
            display: 'system',
          })
        } else {
          setViewState({ mode: 'list' })
        }
      }
    }
    const totalItems = allSelectableItems().length
    if (selectedIndex() >= totalItems && totalItems > 0) {
      setSelectedIndex(totalItems - 1)
    }
  })

  const goBackToList = () => {
    if (skippedListOnMount && allSelectableItems().length <= 1) {
      props.onDone('Background tasks dialog dismissed', { display: 'system' })
    } else {
      skippedListOnMount = false
      setViewState({ mode: 'list' })
    }
  }

  const handleCancel = () =>
    props.onDone('Background tasks dialog dismissed', { display: 'system' })

  return (
    <Show
      when={viewState().mode === 'list'}
      fallback={
        <Show when={typedTasks()}>
          {/* Detail view handled by switch on task type - simplified */}
          <ShellDetailDialog
            shell={
              (typedTasks()!)[
                (viewState() as { mode: 'detail'; itemId: string }).itemId
              ] as any
            }
            onDone={props.onDone}
            onBack={goBackToList}
          />
        </Show>
      }
    >
      <box flexDirection="column">
        <Dialog
          title="Background tasks"
          onCancel={handleCancel}
          color="background"
        >
          <Show
            when={allSelectableItems().length > 0}
            fallback={<text dimmed>No tasks currently running</text>}
          >
            <box flexDirection="column">
              <For each={allSelectableItems()}>
                {(item: any) => (
                  <box flexDirection="row">
                    <text dimmed={item.id !== currentSelection()?.id}>
                      {item.id === currentSelection()?.id
                        ? figures.pointer + ' '
                        : '  '}
                    </text>
                    <text
                      fg={
                        item.id === currentSelection()?.id
                          ? 'suggestion'
                          : undefined
                      }
                    >
                      <Show
                        when={item.type !== 'leader'}
                        fallback={<text>@{TEAM_LEAD_NAME}</text>}
                      >
                        <BackgroundTaskComponent task={item.task} />
                      </Show>
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
        </Dialog>
      </box>
    </Show>
  )
}
