import { createSignal, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import sample from 'lodash-es/sample.js'
import { getSpinnerVerbs } from '../../../constants/spinnerVerbs.js'
import { TURN_COMPLETION_VERBS } from '../../../constants/turnCompletionVerbs.js'
import { useElapsedTime } from '../../../hooks/useElapsedTime.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import { summarizeRecentActivities } from '../../../utils/collapseReadSearch.js'
import {
  formatDuration,
  formatNumber,
  truncateToWidth,
} from '../../../utils/format.js'
import { toInkColor } from '../../../utils/ink.js'
import { TEAMMATE_SELECT_HINT } from './teammateSelectHint.js'
import { isToolCallBlock, getToolName } from '../../../utils/toolBlockCompat.js'

type Props = {
  teammate: InProcessTeammateTaskState
  isLast: boolean
  isSelected?: boolean
  isForegrounded?: boolean
  allIdle?: boolean
  showPreview?: boolean
}

function getMessagePreview(
  messages: InProcessTeammateTaskState['messages'],
): string[] {
  if (!messages?.length) return []
  const allLines: string[] = []
  const maxLineLength = 80

  for (let i = messages.length - 1; i >= 0 && allLines.length < 3; i--) {
    const msg = messages[i]
    if (
      !msg ||
      (msg.type !== 'user' && msg.type !== 'assistant') ||
      !msg.message?.content?.length
    ) {
      continue
    }
    const content = msg.message.content

    for (const block of content) {
      if (allLines.length >= 3) break
      if (!block || typeof block !== 'object') continue

      if ('type' in block && isToolCallBlock(block as { type: string })) {
        const input =
          'input' in block ? (block.input as Record<string, unknown>) : null
        let toolLine = `Using ${getToolName(block as Record<string, unknown>)}…`
        if (input) {
          const desc =
            (input.description as string | undefined) ||
            (input.prompt as string | undefined) ||
            (input.command as string | undefined) ||
            (input.query as string | undefined) ||
            (input.pattern as string | undefined)
          if (desc) {
            toolLine = desc.split('\n')[0] ?? toolLine
          }
        }
        allLines.push(truncateToWidth(toolLine, maxLineLength))
      } else if ('type' in block && block.type === 'text' && 'text' in block) {
        const textLines = (block.text as string)
          .split('\n')
          .filter((l) => l.trim())
        for (
          let j = textLines.length - 1;
          j >= 0 && allLines.length < 3;
          j--
        ) {
          const line = textLines[j]
          if (!line) continue
          allLines.push(truncateToWidth(line, maxLineLength))
        }
      }
    }
  }
  return allLines.reverse()
}

export function TeammateSpinnerLine(props: Props): JSXElement {
  const [randomVerb] = createSignal(
    () => props.teammate.spinnerVerb ?? sample(getSpinnerVerbs()),
  )
  const [pastTenseVerb] = createSignal(
    () => props.teammate.pastTenseVerb ?? sample(TURN_COMPLETION_VERBS),
  )
  const isHighlighted = () => props.isSelected || props.isForegrounded
  const treeChar = () =>
    isHighlighted()
      ? props.isLast
        ? '╘═'
        : '╞═'
      : props.isLast
        ? '└─'
        : '├─'
  const nameColor = () => toInkColor(props.teammate.identity.color)
  const { columns } = useTerminalSize()

  let idleStartCurrent: number | null = null
  let frozenDurationCurrent: string | null = null

  if (props.teammate.isIdle && idleStartCurrent === null) {
    idleStartCurrent = Date.now()
  } else if (!props.teammate.isIdle) {
    idleStartCurrent = null
  }

  if (!props.allIdle && frozenDurationCurrent !== null) {
    frozenDurationCurrent = null
  }

  const idleElapsedTime = useElapsedTime(
    idleStartCurrent ?? Date.now(),
    props.teammate.isIdle && !props.allIdle,
  )

  if (props.allIdle && frozenDurationCurrent === null) {
    frozenDurationCurrent = formatDuration(
      Math.max(
        0,
        Date.now() - props.teammate.startTime - (props.teammate.totalPausedMs ?? 0),
      ),
    )
  }

  const displayTime = () =>
    props.allIdle ? (frozenDurationCurrent ?? '') : idleElapsedTime

  const basePrefix = 8
  const fullAgentName = () => `@${props.teammate.identity.agentName}`
  const fullNameWidth = () => stringWidth(fullAgentName())

  const toolUseCount = () => props.teammate.progress?.toolUseCount ?? 0
  const tokenCount = () => props.teammate.progress?.tokenCount ?? 0
  const statsText = () =>
    ` · ${toolUseCount()} tool ${toolUseCount() === 1 ? 'use' : 'uses'} · ${formatNumber(tokenCount())} tokens`
  const statsWidth = () => stringWidth(statsText())
  const selectHintText = () => ` · ${TEAMMATE_SELECT_HINT}`
  const selectHintWidth = () => stringWidth(selectHintText())
  const viewHintText = ' · enter to view'
  const viewHintWidth = stringWidth(viewHintText)

  const minActivityWidth = 25

  const spaceWithFullName = () => columns - basePrefix - fullNameWidth() - 2
  const showName = () => columns >= 60 && spaceWithFullName() >= minActivityWidth
  const nameWidth = () => (showName() ? fullNameWidth() + 2 : 0)
  const availableForActivity = () => columns - basePrefix - nameWidth()

  const showViewHint = () =>
    props.isSelected &&
    !props.isForegrounded &&
    availableForActivity() >
      viewHintWidth + statsWidth() + minActivityWidth + 5
  const showSelectHint = () =>
    isHighlighted() &&
    availableForActivity() >
      selectHintWidth() +
        (showViewHint() ? viewHintWidth : 0) +
        statsWidth() +
        minActivityWidth +
        5
  const showStats = () =>
    availableForActivity() > statsWidth() + minActivityWidth + 5

  const extrasCost = () =>
    (showStats() ? statsWidth() : 0) +
    (showSelectHint() ? selectHintWidth() : 0) +
    (showViewHint() ? viewHintWidth : 0)
  const activityMaxWidth = () =>
    Math.max(minActivityWidth, availableForActivity() - extrasCost() - 1)

  const activityText = () => {
    const activities = props.teammate.progress?.recentActivities
    if (activities && activities.length > 0) {
      const summary = summarizeRecentActivities(activities)
      if (summary) return truncateToWidth(summary, activityMaxWidth())
    }
    const desc = props.teammate.progress?.lastActivity?.activityDescription
    if (desc) return truncateToWidth(desc, activityMaxWidth())
    return randomVerb()
  }

  const renderStatus = (): JSXElement => {
    if (props.teammate.shutdownRequested) {
      return <text dimmed>[stopping]</text>
    }
    if (props.teammate.awaitingPlanApproval) {
      return <text fg="warning">[awaiting approval]</text>
    }
    if (props.teammate.isIdle) {
      if (props.allIdle) {
        return (
          <text dimmed>
            {pastTenseVerb()} for {displayTime()}
          </text>
        )
      }
      return <text dimmed>Idle for {idleElapsedTime}</text>
    }
    if (isHighlighted()) {
      return null
    }
    return (
      <text dimmed>
        {activityText()?.endsWith('…')
          ? activityText()
          : `${activityText()}…`}
      </text>
    )
  }

  const previewLines = () =>
    props.showPreview ? getMessagePreview(props.teammate.messages) : []
  const previewTreeChar = () => (props.isLast ? '   ' : '│  ')

  return (
    <box flexDirection="column">
      <box paddingLeft={3}>
        <text
          fg={props.isSelected ? 'suggestion' : undefined}
          bold={props.isSelected}
        >
          {props.isSelected ? figures.pointer : ' '}
        </text>
        <text dimmed={!props.isSelected}>{treeChar()} </text>
        <Show when={showName()}>
          <text fg={props.isSelected ? 'suggestion' : nameColor()}>
            @{props.teammate.identity.agentName}
          </text>
        </Show>
        <Show when={showName()}>
          <text dimmed={!props.isSelected}>: </text>
        </Show>
        {renderStatus()}
        <Show when={showStats()}>
          <text dimmed>
            {' '}· {toolUseCount()} tool{' '}
            {toolUseCount() === 1 ? 'use' : 'uses'} ·{' '}
            {formatNumber(tokenCount())} tokens
          </text>
        </Show>
        <Show when={showSelectHint()}>
          <text dimmed> · {TEAMMATE_SELECT_HINT}</text>
        </Show>
        <Show when={showViewHint()}>
          <text dimmed> · enter to view</text>
        </Show>
      </box>
      <For each={previewLines()}>
        {(line) => (
          <box paddingLeft={3}>
            <text dimmed> </text>
            <text dimmed>{previewTreeChar()} </text>
            <text dimmed>{line}</text>
          </box>
        )}
      </For>
    </box>
  )
}
