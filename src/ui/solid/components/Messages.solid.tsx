import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  Show,
  For,
  type JSXElement,
} from 'solid-js'
import { feature } from 'bun:bundle'
import chalk from 'chalk'
import type { UUID } from 'crypto'
import { every } from 'src/utils/set.js'
import { getIsRemoteMode } from '../../../bootstrap/state.js'
import type { Command } from '../../../commands.js'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { ScrollBoxHandle } from '../../../ink/components/ScrollBox.js'
import { useTerminalNotification } from '../../../ink/useTerminalNotification.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import type { Screen } from '../../../screens/REPL.js'
import type { Tools } from '../../../Tool.js'
import { findToolByName } from '../../../Tool.js'
import type { AgentDefinitionsResult } from '../../../tools/AgentTool/loadAgentsDir.js'
import type {
  Message as MessageType,
  NormalizedMessage,
  ProgressMessage as ProgressMessageType,
  RenderableMessage,
} from '../../../types/message.js'
import { type AdvisorBlock, isAdvisorBlock } from '../../../utils/advisor.js'
import { collapseBackgroundBashNotifications } from '../../../utils/collapseBackgroundBashNotifications.js'
import { collapseHookSummaries } from '../../../utils/collapseHookSummaries.js'
import { collapseReadSearchGroups } from '../../../utils/collapseReadSearch.js'
import { collapseTeammateShutdowns } from '../../../utils/collapseTeammateShutdowns.js'
import { getGlobalConfig } from '../../../utils/config.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { applyGrouping } from '../../../utils/groupToolUses.js'
import {
  isToolCallBlock,
  isToolResultBlock,
  getToolCallId,
  getToolName,
} from '../../../utils/toolBlockCompat.js'
import {
  buildMessageLookups,
  createAssistantMessage,
  deriveUUID,
  getMessagesAfterCompactBoundary,
  getToolUseID,
  getToolUseIDs,
  hasUnresolvedHooksFromLookup,
  isNotEmptyMessage,
  normalizeMessages,
  reorderMessagesInUI,
  type StreamingThinking,
  type StreamingToolUse,
  shouldShowUserMessage,
} from '../../../utils/messages.js'
import { plural } from '../../../utils/stringUtils.js'
import { renderableSearchText } from '../../../utils/transcriptSearch.js'
import { Divider } from '../design-system/Divider.js'
import type { UnseenDivider } from '../../../components/FullscreenLayout.js'
import { LogoV2 } from '../../solid/LogoV2/LogoV2.solid.js'
import { StreamingMarkdown } from '../components/Markdown.solid.js'
import { MessageRow } from '../components/MessageRow.solid.js'
import {
  InVirtualListContext,
  type MessageActionsNav,
  MessageActionsSelectedContext,
  type MessageActionsState,
} from '../../../components/messageActions.js'
import { AssistantThinkingMessage } from '../messages/AssistantThinkingMessage.solid.js'
import { OffscreenFreeze } from '../components/OffscreenFreeze.solid.js'
import type { ToolUseConfirm } from '../../solid/permissions/PermissionRequest.solid.js'
import { StatusNotices } from '../components/StatusNotices.solid.js'
import { VirtualMessageList, type JumpHandle } from './VirtualMessageList.solid.js'

/**
 * In brief-only mode, filter messages to show ONLY Brief tool_use blocks,
 * their tool_results, and real user input.
 */
export function filterForBriefTool<
  T extends {
    type: string
    subtype?: string
    isMeta?: boolean
    isApiErrorMessage?: boolean
    message?: {
      content: Array<{ type: string; name?: string; tool_use_id?: string }>
    }
    attachment?: {
      type: string
      isMeta?: boolean
      origin?: unknown
      commandMode?: string
    }
  },
>(messages: T[], briefToolNames: string[]): T[] {
  const nameSet = new Set(briefToolNames)
  const briefToolUseIDs = new Set<string>()
  return messages.filter(msg => {
    if (msg.type === 'system') return msg.subtype !== 'api_metrics'
    const block = msg.message?.content[0]
    if (msg.type === 'assistant') {
      if (msg.isApiErrorMessage) return true
      if (
        block &&
        isToolCallBlock(block) &&
        getToolName(block) &&
        nameSet.has(getToolName(block))
      ) {
        const id = getToolCallId(block)
        if (id) briefToolUseIDs.add(id)
        return true
      }
      return false
    }
    if (msg.type === 'user') {
      if (block && isToolResultBlock(block)) {
        return block.tool_use_id !== undefined && briefToolUseIDs.has(block.tool_use_id)
      }
      return !msg.isMeta
    }
    if (msg.type === 'attachment') {
      const att = msg.attachment
      return (
        att?.type === 'queued_command' &&
        att.commandMode === 'prompt' &&
        !att.isMeta &&
        att.origin === undefined
      )
    }
    return false
  })
}

/**
 * Drop text in turns that called Brief. Per-turn: only drops text in
 * turns that actually called Brief.
 */
export function dropTextInBriefTurns<
  T extends {
    type: string
    isMeta?: boolean
    message?: { content: Array<{ type: string; name?: string }> }
  },
>(messages: T[], briefToolNames: string[]): T[] {
  const nameSet = new Set(briefToolNames)
  const turnsWithBrief = new Set<number>()
  const textIndexToTurn: number[] = []
  let turn = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    const block = msg.message?.content[0]
    if (msg.type === 'user' && !(block && isToolResultBlock(block)) && !msg.isMeta) {
      turn++
      continue
    }
    if (msg.type === 'assistant') {
      if (block?.type === 'text') {
        textIndexToTurn[i] = turn
      } else if (
        block &&
        isToolCallBlock(block) &&
        getToolName(block) &&
        nameSet.has(getToolName(block))
      ) {
        turnsWithBrief.add(turn)
      }
    }
  }
  if (turnsWithBrief.size === 0) return messages
  return messages.filter((_, i) => {
    const t = textIndexToTurn[i]
    return t === undefined || !turnsWithBrief.has(t)
  })
}

// Memoized logo header
function LogoHeader(props: { agentDefinitions?: AgentDefinitionsResult }): JSXElement {
  return (
    <OffscreenFreeze>
      <box flexDirection="column" gap={1}>
        <LogoV2 />
        <StatusNotices agentDefinitions={props.agentDefinitions} />
      </box>
    </OffscreenFreeze>
  )
}

type MessagesProps = {
  messages: MessageType[]
  tools: Tools
  agentDefinitions?: AgentDefinitionsResult
  commands: Command[]
  verbose: boolean
  isTranscriptMode: boolean
  isLoading: boolean
  streamingMessage?: StreamingThinking | StreamingToolUse | null
  scrollRef?: { current: ScrollBoxHandle | null }
  jumpRef?: { current: JumpHandle | null }
  onSearchMatchesChange?: (count: number, current: number) => void
  cursor?: MessageActionsState | null
  setCursor?: (c: MessageActionsState | null) => void
  onItemClick?: (msg: RenderableMessage) => void
  unseenDivider?: UnseenDivider
  toolUseConfirm?: ToolUseConfirm
}

export function Messages(props: MessagesProps): JSXElement {
  const { columns } = useTerminalSize()

  // Normalize and filter messages
  const renderableMessages = createMemo((): RenderableMessage[] => {
    const normalized = normalizeMessages(props.messages)
    const afterCompact = getMessagesAfterCompactBoundary(normalized as any) as NormalizedMessage[]
    const reordered = reorderMessagesInUI(afterCompact)
    const lookups = buildMessageLookups(reordered)

    // Apply various collapsing/grouping transforms
    let msgs: RenderableMessage[] = reordered as RenderableMessage[]
    msgs = collapseHookSummaries(msgs as any) as RenderableMessage[]
    msgs = collapseReadSearchGroups(msgs as any) as RenderableMessage[]
    msgs = collapseBackgroundBashNotifications(msgs as any) as RenderableMessage[]
    msgs = collapseTeammateShutdowns(msgs as any) as RenderableMessage[]

    // Filter empty messages
    msgs = msgs.filter(m => isNotEmptyMessage(m as any))

    // Apply tool grouping
    if (!props.verbose) {
      msgs = applyGrouping(msgs as any, lookups) as RenderableMessage[]
    }

    return msgs
  })

  // Search text cache for fast incremental search
  const searchTextCache = new WeakMap<RenderableMessage, string>()
  function extractSearchText(msg: RenderableMessage): string {
    const cached = searchTextCache.get(msg)
    if (cached !== undefined) return cached
    const text = renderableSearchText(msg)
    searchTextCache.set(msg, text)
    return text
  }

  function renderMessage(msg: RenderableMessage, index: number): JSXElement {
    return (
      <MessageRow
        message={msg}
        tools={props.tools}
        verbose={props.verbose}
        isTranscriptMode={props.isTranscriptMode}
        toolUseConfirm={props.toolUseConfirm}
      />
    )
  }

  const itemKey = (msg: RenderableMessage) => {
    if ('uuid' in msg) return (msg as any).uuid
    if ('id' in msg) return String((msg as any).id)
    return String(renderableMessages().indexOf(msg))
  }

  // Fullscreen mode uses VirtualMessageList
  const useVirtual = isFullscreenEnvEnabled()

  return (
    <box flexDirection="column">
      {/* Logo header */}
      <LogoHeader agentDefinitions={props.agentDefinitions} />

      <Show
        when={useVirtual && props.scrollRef}
        fallback={
          <For each={renderableMessages()}>
            {(msg, i) => renderMessage(msg, i())}
          </For>
        }
      >
        <VirtualMessageList
          messages={renderableMessages()}
          scrollRef={props.scrollRef!}
          columns={columns}
          itemKey={itemKey}
          renderItem={renderMessage}
          onItemClick={props.onItemClick}
          extractSearchText={extractSearchText}
          trackStickyPrompt
          selectedIndex={
            props.cursor
              ? renderableMessages().findIndex(
                  m => 'uuid' in m && (m as any).uuid === props.cursor?.messageId,
                )
              : undefined
          }
          setCursor={props.setCursor}
          jumpRef={props.jumpRef}
          onSearchMatchesChange={props.onSearchMatchesChange}
        />
      </Show>

      {/* Streaming indicator */}
      <Show when={props.isLoading && props.streamingMessage}>
        <AssistantThinkingMessage />
      </Show>
    </box>
  )
}
