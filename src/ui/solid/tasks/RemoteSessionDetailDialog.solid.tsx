import { createSignal, createMemo, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import type { SDKMessage } from 'src/entrypoints/agentSdkTypes.js'
import type { ToolUseContext } from 'src/Tool.js'
import type { DeepImmutable } from 'src/types/utils.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../../constants/figures.js'
import { useElapsedTime } from '../../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import type { RemoteAgentTaskState } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { getRemoteTaskSessionUrl } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { AGENT_TOOL_NAME, LEGACY_AGENT_TOOL_NAME } from '../../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../../tools/AskUserQuestionTool/prompt.js'
import { isToolCallBlock, getToolName } from '../../../utils/toolBlockCompat.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../../../tools/ExitPlanModeTool/constants.js'
import { openBrowser } from '../../../utils/browser.js'
import { errorMessage } from '../../../utils/errors.js'
import { formatDuration, truncateToWidth } from '../../../utils/format.js'
import { toInternalMessages } from '../../../utils/messages/mappers.js'
import { EMPTY_LOOKUPS, normalizeMessages } from '../../../utils/messages.js'
import { plural } from '../../../utils/stringUtils.js'
import { teleportResumeCodeSession } from '../../../utils/teleport.js'
import { Select } from '../components/CustomSelect/select.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { Message } from '../components/Message.solid.js'
import {
  formatReviewStageCounts,
  RemoteSessionProgress,
} from '../tasks/RemoteSessionProgress.solid.js'

type Props = {
  session: DeepImmutable<RemoteAgentTaskState>
  toolUseContext: ToolUseContext
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  onBack?: () => void
  onKill?: () => void
}

// Compact one-line summary
export function formatToolUseSummary(name: string, input: unknown): string {
  if (name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
    return 'Review the plan in Claude Code on the web'
  }
  if (!input || typeof input !== 'object') return name
  if (name === ASK_USER_QUESTION_TOOL_NAME && 'questions' in input) {
    const qs = (input as any).questions
    if (Array.isArray(qs) && qs[0] && typeof qs[0] === 'object') {
      const q =
        'question' in qs[0] && typeof qs[0].question === 'string' && qs[0].question
          ? qs[0].question
          : 'header' in qs[0] && typeof qs[0].header === 'string'
            ? qs[0].header
            : null
      if (q) {
        const oneLine = q.replace(/\s+/g, ' ').trim()
        return `Answer in browser: ${truncateToWidth(oneLine, 50)}`
      }
    }
  }
  for (const v of Object.values(input as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) {
      const oneLine = v.replace(/\s+/g, ' ').trim()
      return `${name} ${truncateToWidth(oneLine, 60)}`
    }
  }
  return name
}

const PHASE_LABEL = {
  needs_input: 'input required',
  plan_ready: 'ready',
} as const

const AGENT_VERB = {
  needs_input: 'waiting',
  plan_ready: 'done',
} as const

function UltraplanSessionDetail(props: {
  session: DeepImmutable<RemoteAgentTaskState>
  onDone: Props['onDone']
  onBack?: () => void
  onKill?: () => void
}): JSXElement {
  const running = () => props.session.status === 'running' || props.session.status === 'pending'
  const phase = () => props.session.ultraplanPhase
  const statusText = () =>
    running() ? (phase() ? PHASE_LABEL[phase()!] : 'running') : props.session.status
  const elapsedTime = useElapsedTime(
    props.session.startTime,
    running(),
    1000,
    0,
    props.session.endTime,
  )

  const stats = createMemo(() => {
    let spawns = 0
    let calls = 0
    let lastBlock: any = null
    for (const msg of props.session.log) {
      if (msg.type !== 'assistant') continue
      for (const block of (msg as any).message.content) {
        if (!isToolCallBlock(block)) continue
        calls++
        lastBlock = block
        if (
          getToolName(block) === AGENT_TOOL_NAME ||
          getToolName(block) === LEGACY_AGENT_TOOL_NAME
        ) {
          spawns++
        }
      }
    }
    return {
      agentsWorking: 1 + spawns,
      toolCalls: calls,
      lastToolCall: lastBlock ? formatToolUseSummary(lastBlock.name, lastBlock.input) : null,
    }
  })

  const sessionUrl = createMemo(() => getRemoteTaskSessionUrl(props.session.sessionId))
  const goBackOrClose = () =>
    props.onBack ??
    (() => props.onDone('Remote session details dismissed', { display: 'system' }))

  const [confirmingStop, setConfirmingStop] = createSignal(false)

  return (
    <Show
      when={!confirmingStop()}
      fallback={
        <Dialog title="Stop ultraplan?" onCancel={() => setConfirmingStop(false)} color="background">
          <box flexDirection="column" gap={1}>
            <text dimmed>This will terminate the Claude Code on the web session.</text>
            <Select
              options={[
                { label: 'Terminate session', value: 'stop' as const },
                { label: 'Back', value: 'back' as const },
              ]}
              onChange={(v: string) => {
                if (v === 'stop') {
                  props.onKill?.()
                  goBackOrClose()()
                } else {
                  setConfirmingStop(false)
                }
              }}
            />
          </box>
        </Dialog>
      }
    >
      <Dialog
        title={`ultraplan: ${statusText()}`}
        onCancel={goBackOrClose()}
        color="background"
      >
        <box flexDirection="column" gap={1}>
          <text>
            {stats().agentsWorking} {plural(stats().agentsWorking, 'agent', 'agents')} working{' '}
            {figures.middleDot} {stats().toolCalls} tool {plural(stats().toolCalls, 'call', 'calls')}{' '}
            {figures.middleDot} {formatDuration(elapsedTime())}
          </text>
          <Show when={stats().lastToolCall}>
            <text dimmed>{stats().lastToolCall}</text>
          </Show>
          <Show when={sessionUrl()}>
            <text>
              View in browser: <text fg="blue">{sessionUrl()}</text>
            </text>
          </Show>
          <Show when={running() && props.onKill}>
            <Select
              options={[
                { label: 'Open in browser', value: 'open' },
                { label: 'Stop session', value: 'stop' },
                { label: 'Back', value: 'back' },
              ]}
              onChange={(v: string) => {
                if (v === 'open') void openBrowser(sessionUrl()!)
                else if (v === 'stop') setConfirmingStop(true)
                else goBackOrClose()()
              }}
            />
          </Show>
        </box>
      </Dialog>
    </Show>
  )
}

function StandardSessionDetail(props: {
  session: DeepImmutable<RemoteAgentTaskState>
  toolUseContext: ToolUseContext
  onDone: Props['onDone']
  onBack?: () => void
  onKill?: () => void
}): JSXElement {
  const running = () => props.session.status === 'running' || props.session.status === 'pending'
  const elapsedTime = useElapsedTime(
    props.session.startTime,
    running(),
    1000,
    0,
    props.session.endTime,
  )
  const sessionUrl = createMemo(() => getRemoteTaskSessionUrl(props.session.sessionId))

  const toolCalls = createMemo(() => {
    let calls = 0
    for (const msg of props.session.log) {
      if (msg.type !== 'assistant') continue
      for (const block of (msg as any).message.content) {
        if (isToolCallBlock(block)) calls++
      }
    }
    return calls
  })

  const goBackOrClose = () =>
    props.onBack ??
    (() => props.onDone('Remote session details dismissed', { display: 'system' }))

  const [confirmingStop, setConfirmingStop] = createSignal(false)

  const options = createMemo(() => {
    const opts: Array<{ label: string; value: string }> = []
    if (sessionUrl()) {
      opts.push({ label: 'Open in browser', value: 'open' })
    }
    if (props.session.status === 'completed') {
      opts.push({ label: 'Resume locally', value: 'resume' })
    }
    if (running() && props.onKill) {
      opts.push({ label: 'Stop session', value: 'stop' })
    }
    opts.push({ label: 'Back', value: 'back' })
    return opts
  })

  return (
    <Show
      when={!confirmingStop()}
      fallback={
        <Dialog title="Stop remote session?" onCancel={() => setConfirmingStop(false)} color="background">
          <box flexDirection="column" gap={1}>
            <text dimmed>This will terminate the remote session.</text>
            <Select
              options={[
                { label: 'Terminate session', value: 'stop' },
                { label: 'Back', value: 'back' },
              ]}
              onChange={(v: string) => {
                if (v === 'stop') {
                  props.onKill?.()
                  goBackOrClose()()
                } else {
                  setConfirmingStop(false)
                }
              }}
            />
          </box>
        </Dialog>
      }
    >
      <Dialog
        title={`Remote session: ${props.session.status}`}
        onCancel={goBackOrClose()}
        color="background"
      >
        <box flexDirection="column" gap={1}>
          <text>
            {toolCalls()} tool {plural(toolCalls(), 'call', 'calls')} {figures.middleDot}{' '}
            {formatDuration(elapsedTime())}
          </text>
          <Show when={props.session.reviewStageCounts}>
            <RemoteSessionProgress counts={props.session.reviewStageCounts!} />
          </Show>
          <Show when={sessionUrl()}>
            <text>
              View in browser: <text fg="blue">{sessionUrl()}</text>
            </text>
          </Show>
          <Select
            options={options()}
            onChange={(v: string) => {
              if (v === 'open') void openBrowser(sessionUrl()!)
              else if (v === 'resume') {
                void teleportResumeCodeSession(props.session.sessionId)
                goBackOrClose()()
              } else if (v === 'stop') setConfirmingStop(true)
              else goBackOrClose()()
            }}
          />
        </box>
      </Dialog>
    </Show>
  )
}

export function RemoteSessionDetailDialog(props: Props): JSXElement {
  const isUltraplan = () => props.session.ultraplanPhase !== undefined

  return (
    <Show
      when={isUltraplan()}
      fallback={
        <StandardSessionDetail
          session={props.session}
          toolUseContext={props.toolUseContext}
          onDone={props.onDone}
          onBack={props.onBack}
          onKill={props.onKill}
        />
      }
    >
      <UltraplanSessionDetail
        session={props.session}
        onDone={props.onDone}
        onBack={props.onBack}
        onKill={props.onKill}
      />
    </Show>
  )
}
