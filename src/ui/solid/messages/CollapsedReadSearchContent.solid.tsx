/**
 * CollapsedReadSearchContent — SolidJS port of
 * src/components/messages/CollapsedReadSearchContent.tsx
 *
 * Renders collapsed groups of read/search/bash tool uses.
 * In non-verbose mode: one-line summary with counts.
 * In verbose mode: each tool use with its result.
 */
import { basename } from 'path'
import { Show, For, type JSX } from 'solid-js'
import { findToolByName, type Tools } from '../../../Tool.js'
import type { CollapsedReadSearchGroup, NormalizedAssistantMessage } from '../../../types/message.js'
import { uniq } from '../../../utils/array.js'
import { getToolUseIdsFromCollapsedGroup } from '../../../utils/collapseReadSearch.js'
import { getDisplayPath } from '../../../utils/file.js'
import { formatDuration, formatSecondsShort } from '../../../utils/format.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import type { buildMessageLookups } from '../../../utils/messages.js'
import type { ThemeName } from '../../../utils/theme.js'
import { isToolCallBlock, getToolCallId, getToolName } from '../../../utils/toolBlockCompat.js'

const MIN_HINT_DISPLAY_MS = 700

type CollapsedReadSearchContentProps = {
  message: CollapsedReadSearchGroup
  inProgressToolUseIDs: Set<string>
  shouldAnimate: boolean
  verbose: boolean
  tools: Tools
  lookups: ReturnType<typeof buildMessageLookups>
  isActiveGroup?: boolean
  theme: ThemeName
  bg?: string
}

function VerboseToolUse(props: {
  content: { id: string; name: string; input: any }
  tools: Tools
  lookups: ReturnType<typeof buildMessageLookups>
  inProgressToolUseIDs: Set<string>
  shouldAnimate: boolean
  theme: ThemeName
  bg?: string
}): JSX.Element | null {
  const tool = () =>
    findToolByName(props.tools, props.content.name) ??
    // Fallback to primitive tools
    null

  const isResolved = () => props.lookups.resolvedToolUseIDs.has(props.content.id)
  const isError = () => props.lookups.erroredToolUseIDs.has(props.content.id)
  const isInProgress = () => props.inProgressToolUseIDs.has(props.content.id)

  const parsedInput = () => {
    const t = tool()
    if (!t) return undefined
    const result = t.inputSchema.safeParse(props.content.input)
    return result.success ? result.data : undefined
  }

  const userFacingName = () => {
    const t = tool()
    const input = parsedInput()
    return t && input ? t.userFacingName(input) : props.content.name
  }

  const toolUseMessage = () => {
    const t = tool()
    const input = parsedInput()
    return t && input ? t.renderToolUseMessage(input, { theme: props.theme, verbose: true }) : null
  }

  return (
    <Show when={tool()}>
      <box flexDirection="column" marginTop={1} bg={props.bg}>
        <box flexDirection="row">
          <text>
            {props.shouldAnimate && isInProgress() ? '\u25CF ' : isError() ? '\u2718 ' : isResolved() ? '\u2714 ' : '\u25CB '}
          </text>
          <text>
            <b>{userFacingName()}</b>
            <Show when={toolUseMessage()}>({toolUseMessage()})</Show>
          </text>
        </box>
      </box>
    </Show>
  )
}

export function CollapsedReadSearchContent(props: CollapsedReadSearchContentProps): JSX.Element | null {
  const {
    searchCount: rawSearchCount,
    readCount: rawReadCount,
    listCount: rawListCount,
    replCount,
    memorySearchCount,
    memoryReadCount,
    memoryWriteCount,
    messages: groupMessages,
  } = props.message

  const toolUseIds = getToolUseIdsFromCollapsedGroup(props.message)
  const anyError = () => toolUseIds.some((id) => props.lookups.erroredToolUseIDs.has(id))
  const hasMemoryOps = memorySearchCount > 0 || memoryReadCount > 0 || memoryWriteCount > 0

  // Use max seen counts so they only increase
  let maxRead = rawReadCount
  let maxSearch = rawSearchCount
  let maxList = rawListCount
  let maxMcp = props.message.mcpCallCount ?? 0
  let maxBash = props.message.bashCount ?? 0
  const readCount = Math.max(maxRead, rawReadCount)
  const searchCount = Math.max(maxSearch, rawSearchCount)
  const listCount = Math.max(maxList, rawListCount)
  const mcpCallCount = Math.max(maxMcp, props.message.mcpCallCount ?? 0)
  const gitOpBashCount = props.message.gitOpBashCount ?? 0
  const bashCount = isFullscreenEnvEnabled()
    ? Math.max(0, Math.max(maxBash, props.message.bashCount ?? 0) - gitOpBashCount)
    : 0
  const hasNonMemoryOps =
    searchCount > 0 ||
    readCount > 0 ||
    listCount > 0 ||
    replCount > 0 ||
    mcpCallCount > 0 ||
    bashCount > 0 ||
    gitOpBashCount > 0

  // Verbose mode: render each tool use
  if (props.verbose) {
    const toolUses: NormalizedAssistantMessage[] = []
    for (const msg of groupMessages) {
      if (msg.type === 'assistant') {
        toolUses.push(msg)
      } else if (msg.type === 'grouped_tool_use') {
        toolUses.push(...msg.messages)
      }
    }
    return (
      <box flexDirection="column">
        <For each={toolUses}>
          {(msg) => {
            const content = msg.message.content[0]
            if (content?.type !== 'tool_use') return null
            return (
              <VerboseToolUse
                content={content}
                tools={props.tools}
                lookups={props.lookups}
                inProgressToolUseIDs={props.inProgressToolUseIDs}
                shouldAnimate={props.shouldAnimate}
                theme={props.theme}
                bg={props.bg}
              />
            )
          }}
        </For>
        <Show when={props.message.hookTotalMs !== undefined && props.message.hookTotalMs > 0}>
          <text dimmed>
            {'  \u23BF  '}Ran {props.message.hookCount} PreToolUse{' '}
            {props.message.hookCount === 1 ? 'hook' : 'hooks'} (
            {formatSecondsShort(props.message.hookTotalMs ?? 0)})
          </text>
        </Show>
        <Show when={props.message.relevantMemories}>
          <For each={props.message.relevantMemories ?? []}>
            {(m) => (
              <box flexDirection="column" marginTop={1}>
                <text dimmed>{'  \u23BF  '}Recalled {basename(m.path)}</text>
                <box paddingLeft={5}>
                  <text>{m.content}</text>
                </box>
              </box>
            )}
          </For>
        </Show>
      </box>
    )
  }

  // Non-verbose mode: summary counts
  if (!hasMemoryOps && !hasNonMemoryOps) return null

  const parts: string[] = []

  if (searchCount > 0) {
    const verb = props.isActiveGroup ? 'Searching for' : 'Searched for'
    parts.push(`${parts.length === 0 ? verb : verb.toLowerCase()} ${searchCount} ${searchCount === 1 ? 'pattern' : 'patterns'}`)
  }
  if (readCount > 0) {
    const verb = props.isActiveGroup ? 'Reading' : 'Read'
    parts.push(`${parts.length === 0 ? verb : verb.toLowerCase()} ${readCount} ${readCount === 1 ? 'file' : 'files'}`)
  }
  if (listCount > 0) {
    const verb = props.isActiveGroup ? 'Listing' : 'Listed'
    parts.push(`${parts.length === 0 ? verb : verb.toLowerCase()} ${listCount} ${listCount === 1 ? 'directory' : 'directories'}`)
  }
  if (replCount > 0) {
    const verb = props.isActiveGroup ? "REPL'ing" : "REPL'd"
    parts.push(`${verb} ${replCount} ${replCount === 1 ? 'time' : 'times'}`)
  }
  if (mcpCallCount > 0) {
    const serverLabel =
      props.message.mcpServerNames?.map((n) => n.replace(/^claude\.ai /, '')).join(', ') || 'MCP'
    const verb = props.isActiveGroup ? 'Querying' : 'Queried'
    parts.push(
      `${parts.length === 0 ? verb : verb.toLowerCase()} ${serverLabel}${mcpCallCount > 1 ? ` ${mcpCallCount} times` : ''}`,
    )
  }
  if (bashCount > 0) {
    const verb = props.isActiveGroup ? 'Running' : 'Ran'
    parts.push(
      `${parts.length === 0 ? verb : verb.toLowerCase()} ${bashCount} bash ${bashCount === 1 ? 'command' : 'commands'}`,
    )
  }

  // Memory parts
  if (memoryReadCount > 0) {
    const verb = props.isActiveGroup ? 'Recalling' : 'Recalled'
    parts.push(
      `${parts.length === 0 ? verb : verb.toLowerCase()} ${memoryReadCount} ${memoryReadCount === 1 ? 'memory' : 'memories'}`,
    )
  }
  if (memorySearchCount > 0) {
    parts.push(`${parts.length === 0 ? 'Searched' : 'searched'} memories`)
  }
  if (memoryWriteCount > 0) {
    const verb = props.isActiveGroup ? 'Writing' : 'Wrote'
    parts.push(
      `${parts.length === 0 ? verb : verb.toLowerCase()} ${memoryWriteCount} ${memoryWriteCount === 1 ? 'memory' : 'memories'}`,
    )
  }

  return (
    <box flexDirection="column" marginTop={1} bg={props.bg}>
      <box flexDirection="row">
        <Show when={props.isActiveGroup}>
          <text>{'\u25CF '}</text>
        </Show>
        <Show when={!props.isActiveGroup}>
          <box minWidth={2} />
        </Show>
        <text dimmed={!props.isActiveGroup}>
          {parts.join(', ')}
          <Show when={props.isActiveGroup}>{'\u2026'}</Show>
        </text>
      </box>
      <Show when={props.message.hookTotalMs !== undefined && props.message.hookTotalMs > 0}>
        <text dimmed>
          {'  \u23BF  '}Ran {props.message.hookCount} PreToolUse{' '}
          {props.message.hookCount === 1 ? 'hook' : 'hooks'} (
          {formatSecondsShort(props.message.hookTotalMs)})
        </text>
      </Show>
    </box>
  )
}
