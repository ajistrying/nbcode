import { createSignal, createEffect, onCleanup, Show, For, type JSXElement } from 'solid-js'
import type { DeepImmutable } from '../../../types/utils.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import type { LocalShellTaskState } from '../../../tasks/LocalShellTask/guards.js'
import {
  formatDuration,
  formatFileSize,
  truncateToWidth,
} from '../../../utils/format.js'
import { tailFile } from '../../../utils/fsOperations.js'
import { getTaskOutputPath } from '../../../utils/task/diskOutput.js'
import { Byline } from '../../solid/design-system/Byline.js'
import { Dialog } from '../../solid/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../solid/design-system/KeyboardShortcutHint.js'

type Props = {
  shell: DeepImmutable<LocalShellTaskState>
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  onKillShell?: () => void
  onBack?: () => void
}

const SHELL_DETAIL_TAIL_BYTES = 8192

type TaskOutputResult = {
  content: string
  bytesTotal: number
}

async function getTaskOutput(
  shell: DeepImmutable<LocalShellTaskState>,
): Promise<TaskOutputResult> {
  const path = getTaskOutputPath(shell.id)
  try {
    const result = await tailFile(path, SHELL_DETAIL_TAIL_BYTES)
    return { content: result.content, bytesTotal: result.bytesTotal }
  } catch {
    return { content: '', bytesTotal: 0 }
  }
}

export function ShellDetailDialog(props: Props): JSXElement {
  const { columns } = useTerminalSize()
  const [output, setOutput] = createSignal<TaskOutputResult>({
    content: '',
    bytesTotal: 0,
  })

  createEffect(() => {
    void getTaskOutput(props.shell).then(setOutput)

    if (props.shell.status === 'running') {
      const timer = setInterval(async () => {
        const result = await getTaskOutput(props.shell)
        setOutput(result)
      }, 1000)
      onCleanup(() => clearInterval(timer))
    }
  })

  const handleClose = () =>
    props.onDone('Shell details dismissed', { display: 'system' })

  useKeybindings(
    {
      'confirm:yes': handleClose,
    },
    { context: 'Confirmation' },
  )

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      props.onDone('Shell details dismissed', { display: 'system' })
    } else if (e.key === 'left' && props.onBack) {
      e.preventDefault()
      props.onBack()
    } else if (
      e.key === 'x' &&
      props.shell.status === 'running' &&
      props.onKillShell
    ) {
      e.preventDefault()
      props.onKillShell()
    }
  }

  const isMonitor = () => props.shell.kind === 'monitor'
  const displayCommand = () => truncateToWidth(props.shell.command, 280)

  const renderedLines = () => {
    const { content, bytesTotal } = output()
    if (!content) return { lines: [], isIncomplete: false }
    const starts: number[] = []
    let pos = content.length
    for (let i = 0; i < 10 && pos > 0; i++) {
      const prev = content.lastIndexOf('\n', pos - 1)
      starts.push(prev + 1)
      pos = prev
    }
    starts.reverse()
    const lines: string[] = []
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i]!
      const end = i < starts.length - 1 ? starts[i + 1]! - 1 : content.length
      const line = content.slice(start, end)
      if (line) lines.push(line)
    }
    return { lines, isIncomplete: bytesTotal > content.length }
  }

  return (
    <box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title={isMonitor() ? 'Monitor details' : 'Shell details'}
        onCancel={handleClose}
        color="background"
        inputGuide={(exitState: any) =>
          exitState.pending ? (
            <text>Press {exitState.keyName} again to exit</text>
          ) : (
            <Byline>
              <Show when={props.onBack}>
                <KeyboardShortcutHint shortcut="←" action="go back" />
              </Show>
              <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="close" />
              <Show
                when={
                  props.shell.status === 'running' && props.onKillShell
                }
              >
                <KeyboardShortcutHint shortcut="x" action="stop" />
              </Show>
            </Byline>
          )
        }
      >
        <box flexDirection="column">
          <text>
            <text><b>Status:</b></text>{' '}
            <Show
              when={props.shell.status === 'running'}
              fallback={
                <Show
                  when={props.shell.status === 'completed'}
                  fallback={
                    <text fg="error">
                      {props.shell.status}
                      {props.shell.result?.code !== undefined &&
                        ` (exit code: ${props.shell.result.code})`}
                    </text>
                  }
                >
                  <text fg="success">
                    {props.shell.status}
                    {props.shell.result?.code !== undefined &&
                      ` (exit code: ${props.shell.result.code})`}
                  </text>
                </Show>
              }
            >
              <text fg="background">
                {props.shell.status}
                {props.shell.result?.code !== undefined &&
                  ` (exit code: ${props.shell.result.code})`}
              </text>
            </Show>
          </text>
          <text>
            <text><b>Runtime:</b></text>{' '}
            {formatDuration(
              (props.shell.endTime ?? Date.now()) - props.shell.startTime,
            )}
          </text>
          <text wrap="wrap">
            <text><b>{isMonitor() ? 'Script:' : 'Command:'}</b></text>{' '}
            {displayCommand()}
          </text>
        </box>

        <box flexDirection="column">
          <text><b>Output:</b></text>
          <Show
            when={output().content}
            fallback={<text dimmed>No output available</text>}
          >
            <box
              borderStyle="round"
              paddingX={1}
              flexDirection="column"
              height={12}
              maxWidth={columns - 6}
            >
              <For each={renderedLines().lines}>
                {(line) => <text wrap="truncate-end">{line}</text>}
              </For>
            </box>
            <text dimmed italic>
              {`Showing ${renderedLines().lines.length} lines`}
              {renderedLines().isIncomplete
                ? ` of ${formatFileSize(output().bytesTotal)}`
                : ''}
            </text>
          </Show>
        </box>
      </Dialog>
    </box>
  )
}
