import { createSignal, Show, For, onMount } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import sample from 'lodash-es/sample.js'
import { BLACK_CIRCLE, REFERENCE_MARK, TEARDROP_ASTERISK } from '../../../constants/figures.js'
import figures from 'figures'
import { basename } from 'path'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { FilePathLink } from '../../../components/FilePathLink.js'
import { openPath } from '../../../utils/browser.js'
const teamMemSaved = feature('TEAMMEM')
  ? (require('./teamMemSaved.js') as typeof import('./teamMemSaved.js'))
  : null
import { TURN_COMPLETION_VERBS } from '../../../constants/turnCompletionVerbs.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type {
  SystemMessage,
  SystemStopHookSummaryMessage,
  SystemBridgeStatusMessage,
  SystemTurnDurationMessage,
  SystemThinkingMessage,
  SystemMemorySavedMessage,
} from '../../../types/message.js'
import { SystemAPIErrorMessage } from './SystemAPIErrorMessage.solid.js'
import { formatDuration, formatNumber, formatSecondsShort } from '../../../utils/format.js'
import { getGlobalConfig } from '../../../utils/config.js'
import Link from '../../../ink/components/Link.js'
import ThemedText from '../../design-system/ThemedText.js'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { useAppStateStore } from '../../../state/AppState.js'
import { isBackgroundTask, type TaskState } from '../../../tasks/types.js'
import { getPillLabel } from '../../../tasks/pillLabel.js'

type Props = {
  message: SystemMessage
  addMargin: boolean
  verbose: boolean
  isTranscriptMode?: boolean
}

export function SystemTextMessage(props: Props): JSX.Element {
  if (props.message.subtype === 'turn_duration') {
    return (
      <TurnDurationMessage
        message={props.message as SystemTurnDurationMessage}
        addMargin={props.addMargin}
      />
    )
  }

  if (props.message.subtype === 'memory_saved') {
    return (
      <MemorySavedMessage
        message={props.message as SystemMemorySavedMessage}
        addMargin={props.addMargin}
      />
    )
  }

  if (props.message.subtype === 'away_summary') {
    return (
      <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
        <box minWidth={2}>
          <text dimmed>{REFERENCE_MARK}</text>
        </box>
        <text dimmed>{props.message.content}</text>
      </box>
    )
  }

  if (props.message.subtype === 'agents_killed') {
    return (
      <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
        <box minWidth={2}>
          <text fg="error">{BLACK_CIRCLE}</text>
        </box>
        <text dimmed>All background agents stopped</text>
      </box>
    )
  }

  if (props.message.subtype === 'thinking') {
    return null
  }

  if (props.message.subtype === 'bridge_status') {
    return (
      <BridgeStatusMessage
        message={props.message as SystemBridgeStatusMessage}
        addMargin={props.addMargin}
      />
    )
  }

  if (props.message.subtype === 'scheduled_task_fire') {
    return (
      <box marginTop={props.addMargin ? 1 : 0} width="100%">
        <text dimmed>
          {TEARDROP_ASTERISK} {props.message.content}
        </text>
      </box>
    )
  }

  if (props.message.subtype === 'permission_retry') {
    return (
      <box marginTop={props.addMargin ? 1 : 0} width="100%">
        <text dimmed>{TEARDROP_ASTERISK} </text>
        <text>Allowed </text>
        <text>
          <b>{(props.message as any).commands.join(', ')}</b>
        </text>
      </box>
    )
  }

  const isStopHookSummary = props.message.subtype === 'stop_hook_summary'
  if (!isStopHookSummary && !props.verbose && props.message.level === 'info') {
    return null
  }

  if (props.message.subtype === 'api_error') {
    return <SystemAPIErrorMessage message={props.message as any} verbose={props.verbose} />
  }

  if (props.message.subtype === 'stop_hook_summary') {
    return (
      <StopHookSummaryMessage
        message={props.message as SystemStopHookSummaryMessage}
        addMargin={props.addMargin}
        verbose={props.verbose}
        isTranscriptMode={props.isTranscriptMode}
      />
    )
  }

  const content = props.message.content
  if (typeof content !== 'string') return null

  return (
    <box flexDirection="row" width="100%">
      <SystemTextMessageInner
        content={content}
        addMargin={props.addMargin}
        dot={props.message.level !== 'info'}
        color={props.message.level === 'warning' ? 'warning' : undefined}
        dimColor={props.message.level === 'info'}
      />
    </box>
  )
}

// ── Helpers / Sub-components ─────────────────────────────────────────────────

const HOOK_TIMING_DISPLAY_THRESHOLD_MS = 2000

function StopHookSummaryMessage(props: {
  message: SystemStopHookSummaryMessage
  addMargin: boolean
  verbose: boolean
  isTranscriptMode?: boolean
}): JSX.Element {
  const { columns } = useTerminalSize()
  const totalDurationMs = () =>
    props.message.totalDurationMs ??
    props.message.hookInfos.reduce((sum, h) => sum + (h.durationMs ?? 0), 0)

  if (
    props.message.hookErrors.length === 0 &&
    !props.message.preventedContinuation &&
    !props.message.hookLabel
  ) {
    if (true || totalDurationMs() < HOOK_TIMING_DISPLAY_THRESHOLD_MS) {
      return null
    }
  }

  const totalStr = () =>
    false && totalDurationMs() > 0 ? ` (${formatSecondsShort(totalDurationMs())})` : ''

  if (props.message.hookLabel) {
    return (
      <box flexDirection="column" width="100%">
        <text dimmed>
          {'  \u23BF  '}Ran {props.message.hookCount} {props.message.hookLabel}{' '}
          {props.message.hookCount === 1 ? 'hook' : 'hooks'}
          {totalStr()}
        </text>
        <Show when={props.isTranscriptMode}>
          <For each={props.message.hookInfos}>
            {(info, idx) => {
              const durationStr =
                false && info.durationMs !== undefined
                  ? ` (${formatSecondsShort(info.durationMs)})`
                  : ''
              return (
                <text dimmed>
                  {'     \u23BF '}
                  {info.command === 'prompt'
                    ? `prompt: ${info.promptText || ''}`
                    : info.command}
                  {durationStr}
                </text>
              )
            }}
          </For>
        </Show>
      </box>
    )
  }

  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
      <box minWidth={2}>
        <text>{BLACK_CIRCLE}</text>
      </box>
      <box flexDirection="column" width={columns - 10}>
        <text>
          Ran <text><b>{props.message.hookCount}</b></text>{' '}
          {props.message.hookLabel ?? 'stop'}{' '}
          {props.message.hookCount === 1 ? 'hook' : 'hooks'}
          {totalStr()}
          <Show when={!props.verbose && props.message.hookInfos.length > 0}>
            {' '}
            <CtrlOToExpand />
          </Show>
        </text>
        <Show when={props.verbose && props.message.hookInfos.length > 0}>
          <For each={props.message.hookInfos}>
            {(info, idx) => {
              const durationStr =
                false && info.durationMs !== undefined
                  ? ` (${formatSecondsShort(info.durationMs)})`
                  : ''
              return (
                <text dimmed>
                  \u23BF{' '}
                  {info.command === 'prompt'
                    ? `prompt: ${info.promptText || ''}`
                    : info.command}
                  {durationStr}
                </text>
              )
            }}
          </For>
        </Show>
        <Show when={props.message.preventedContinuation && props.message.stopReason}>
          <text>
            <text dimmed>\u23BF </text>
            {props.message.stopReason}
          </text>
        </Show>
        <Show when={props.message.hookErrors.length > 0}>
          <For each={props.message.hookErrors}>
            {(err) => (
              <text>
                <text dimmed>\u23BF </text>
                {props.message.hookLabel ?? 'Stop'} hook error: {err}
              </text>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}

function SystemTextMessageInner(props: {
  content: string
  addMargin: boolean
  dot: boolean
  color?: string
  dimColor: boolean
}): JSX.Element {
  const { columns } = useTerminalSize()

  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
      <Show when={props.dot}>
        <box minWidth={2}>
          <text fg={props.color} dimmed={props.dimColor}>
            {BLACK_CIRCLE}
          </text>
        </box>
      </Show>
      <box flexDirection="column" width={columns - 10}>
        <text fg={props.color} dimmed={props.dimColor} wrap="wrap">
          {props.content.trim()}
        </text>
      </box>
    </box>
  )
}

function TurnDurationMessage(props: {
  message: SystemTurnDurationMessage
  addMargin: boolean
}): JSX.Element {
  // useState with lazy init → plain variable initialized once
  const [verb] = createSignal(sample(TURN_COMPLETION_VERBS) ?? 'Worked')

  const store = useAppStateStore()
  const [backgroundTaskSummary] = createSignal(() => {
    const tasks = store.getState().tasks
    const running = (Object.values(tasks ?? {}) as TaskState[]).filter(isBackgroundTask)
    return running.length > 0 ? getPillLabel(running) : null
  })

  const showTurnDuration = getGlobalConfig().showTurnDuration ?? true
  const duration = () => formatDuration(props.message.durationMs)

  const hasBudget = () => props.message.budgetLimit !== undefined

  const budgetSuffix = () => {
    if (!hasBudget()) return ''
    const tokens = props.message.budgetTokens!
    const limit = props.message.budgetLimit!
    const usage =
      tokens >= limit
        ? `${formatNumber(tokens)} used (${formatNumber(limit)} min ${figures.tick})`
        : `${formatNumber(tokens)} / ${formatNumber(limit)} (${Math.round((tokens / limit) * 100)}%)`
    const nudges =
      props.message.budgetNudges > 0
        ? ` \u00B7 ${props.message.budgetNudges} ${props.message.budgetNudges === 1 ? 'nudge' : 'nudges'}`
        : ''
    return `${showTurnDuration ? ' \u00B7 ' : ''}${usage}${nudges}`
  }

  if (!showTurnDuration && !hasBudget()) return null

  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
      <box minWidth={2}>
        <text dimmed>{TEARDROP_ASTERISK}</text>
      </box>
      <text dimmed>
        {showTurnDuration && `${verb()} for ${duration()}`}
        {budgetSuffix()}
        {backgroundTaskSummary() && ` \u00B7 ${backgroundTaskSummary()} still running`}
      </text>
    </box>
  )
}

function MemorySavedMessage(props: {
  message: SystemMemorySavedMessage
  addMargin: boolean
}): JSX.Element {
  const team = () =>
    feature('TEAMMEM') ? teamMemSaved!.teamMemSavedPart(props.message) : null

  const privateCount = () =>
    props.message.writtenPaths.length - (team()?.count ?? 0)

  const parts = () => {
    const p = privateCount()
    const pStr = p > 0 ? `${p} ${p === 1 ? 'memory' : 'memories'}` : null
    const tStr = team()?.segment
    return [pStr, tStr].filter(Boolean) as string[]
  }

  return (
    <box flexDirection="column" marginTop={props.addMargin ? 1 : 0}>
      <box flexDirection="row">
        <box minWidth={2}>
          <text dimmed>{BLACK_CIRCLE}</text>
        </box>
        <text>
          {props.message.verb ?? 'Saved'} {parts().join(' \u00B7 ')}
        </text>
      </box>
      <For each={props.message.writtenPaths}>
        {(p) => <MemoryFileRow path={p} />}
      </For>
    </box>
  )
}

function MemoryFileRow(props: { path: string }): JSX.Element {
  const [hover, setHover] = createSignal(false)
  const handleClick = () => void openPath(props.path)

  return (
    <MessageResponse>
      <box onClick={handleClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <text dimmed={!hover()} underline={hover()}>
          <FilePathLink filePath={props.path}>{basename(props.path)}</FilePathLink>
        </text>
      </box>
    </MessageResponse>
  )
}

function ThinkingMessage(props: {
  message: SystemThinkingMessage
  addMargin: boolean
}): JSX.Element {
  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width="100%">
      <box minWidth={2}>
        <text dimmed>{TEARDROP_ASTERISK}</text>
      </box>
      <text dimmed>{props.message.content}</text>
    </box>
  )
}

function BridgeStatusMessage(props: {
  message: SystemBridgeStatusMessage
  addMargin: boolean
}): JSX.Element {
  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} width={999}>
      <box minWidth={2} />
      <box flexDirection="column">
        <text>
          <ThemedText color="suggestion">/remote-control</ThemedText> is active. Code in CLI or at
        </text>
        <Link url={props.message.url}>{props.message.url}</Link>
        <Show when={props.message.upgradeNudge}>
          <text dimmed>\u23BF {props.message.upgradeNudge}</text>
        </Show>
      </box>
    </box>
  )
}
