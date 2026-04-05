/**
 * Framework-agnostic stream event handler.
 *
 * Extracts the streaming message processing logic from REPL.tsx's
 * `onQueryEvent` callback and `utils/messages.ts`'s `handleMessageFromStream`.
 *
 * The core idea: given the current message list + an incoming stream event,
 * produce a new message list and any side-effect descriptors — no React hooks,
 * no setState calls.  The caller (REPL.tsx today, headless runner tomorrow)
 * applies the returned state however it likes.
 *
 * This module re-exports the existing `handleMessageFromStream` for callers
 * that still use the callback-based API. New code should prefer
 * `processStreamEvent` which returns a state-change descriptor instead.
 */

import type { SpinnerMode } from '../../components/Spinner/index.js'
import type {
  Message,
  StreamEvent,
  RequestStartEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../../types/message.js'
import type { StreamingToolUse, StreamingThinking } from '../../utils/messages.js'

// ---------------------------------------------------------------------------
// State snapshot: what the caller hands in
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of message-related state at the time an event arrives.
 * The handler never mutates this — it returns a new `StreamStateUpdate`.
 */
export type StreamState = {
  /** Current conversation messages (the React `messages` state). */
  messages: readonly Message[]
  /** Current streaming tool uses being accumulated. */
  streamingToolUses: readonly StreamingToolUse[]
  /** Accumulated response length for OTPS tracking. */
  responseLength: number
  /** Current streaming thinking state (null if not thinking). */
  streamingThinking: StreamingThinking | null
  /** Current raw streaming text accumulator (null when not streaming text). */
  streamingText: string | null
}

// ---------------------------------------------------------------------------
// Configuration: toggles the caller provides
// ---------------------------------------------------------------------------

/**
 * Flags that affect how events are processed.
 */
export type StreamHandlerOptions = {
  /** Whether fullscreen mode is enabled (affects compact boundary handling). */
  isFullscreen: boolean
}

// ---------------------------------------------------------------------------
// Return value: what the handler produces
// ---------------------------------------------------------------------------

/**
 * Describes every state change that should be applied after processing one
 * stream event. Only fields that changed are non-undefined — the caller can
 * skip applying fields that are `undefined`.
 *
 * This is intentionally a plain object (not a class, not a Map) so it can be
 * serialised, logged, or diffed trivially during debugging.
 */
export type StreamStateUpdate = {
  /**
   * Updated messages array, or undefined if messages did not change.
   * When set, replaces the entire messages array (not a patch).
   */
  messages?: Message[]

  /**
   * Updated streaming tool uses, or undefined if unchanged.
   */
  streamingToolUses?: StreamingToolUse[]

  /**
   * Delta to add to responseLength (always >= 0).
   * Undefined means no change.
   */
  responseLengthDelta?: number

  /**
   * New spinner/stream mode, or undefined if unchanged.
   */
  streamMode?: SpinnerMode

  /**
   * Updated streaming thinking state, or undefined if unchanged.
   * Null means "clear the thinking state".
   */
  streamingThinking?: StreamingThinking | null

  /**
   * Updated streaming text accumulator, or undefined if unchanged.
   * Null means "clear the streaming text".
   */
  streamingText?: string | null

  /**
   * When set, this message should be removed from the message list.
   * Used for tombstone handling.
   */
  tombstonedMessage?: Message

  /**
   * API metrics from a request start event.
   */
  apiMetrics?: { ttftMs: number }

  /**
   * When true, the caller should regenerate the conversationId
   * (triggers React key refresh after compaction).
   */
  shouldRefreshConversationId?: boolean
}

// ---------------------------------------------------------------------------
// Ephemeral progress detection
// ---------------------------------------------------------------------------

/**
 * Progress data types that are ephemeral (only the last tick matters).
 * Matches the EPHEMERAL_PROGRESS_TYPES set from utils/sessionStorage.ts.
 * Kept here as a pure function to avoid importing the session storage module.
 */
const EPHEMERAL_DATA_TYPES = new Set<string>([
  'bash_progress',
  'sleep_progress',
])

function isEphemeralToolProgress(dataType: unknown): boolean {
  return typeof dataType === 'string' && EPHEMERAL_DATA_TYPES.has(dataType)
}

// ---------------------------------------------------------------------------
// Compact boundary detection
// ---------------------------------------------------------------------------

function isCompactBoundaryMessage(message: Message): boolean {
  return message?.type === 'system' && (message as { subtype?: string }).subtype === 'compact_boundary'
}

// ---------------------------------------------------------------------------
// Core: process a single event from the query generator
// ---------------------------------------------------------------------------

/**
 * The raw event type yielded by the `query()` async generator.
 * This union matches `Parameters<typeof handleMessageFromStream>[0]`.
 */
export type QueryGeneratorEvent =
  | Message
  | TombstoneMessage
  | StreamEvent
  | RequestStartEvent
  | ToolUseSummaryMessage

/**
 * Process a single event from the query generator and return a state-change
 * descriptor. This is the primary extraction target — it encapsulates the
 * business logic of REPL.tsx's `onQueryEvent` + `handleMessageFromStream`
 * without any React dependencies.
 *
 * The caller is responsible for:
 * - Applying `update.messages` (if set) to its message store
 * - Applying `update.streamMode` to its spinner/status UI
 * - Handling `update.tombstonedMessage` (remove from transcript, etc.)
 * - Accumulating `update.responseLengthDelta` for OTPS metrics
 * - Handling `update.shouldRefreshConversationId` for React key refresh
 */
export function processStreamEvent(
  event: QueryGeneratorEvent,
  state: StreamState,
  options: StreamHandlerOptions,
): StreamStateUpdate {
  const update: StreamStateUpdate = {}

  // -----------------------------------------------------------------------
  // Non-stream events: completed messages, tombstones, summaries
  // -----------------------------------------------------------------------
  if (event.type !== 'stream_event' && event.type !== 'stream_request_start') {
    // Tombstone: remove the targeted message
    if (event.type === 'tombstone') {
      const tombstoneEvt = event as TombstoneMessage
      update.tombstonedMessage = tombstoneEvt.message
      update.messages = state.messages.filter(
        m => m !== tombstoneEvt.message,
      ) as Message[]
      return update
    }

    // Tool use summary messages are SDK-only, ignore in stream handling
    if (event.type === 'tool_use_summary') {
      return update
    }

    // Complete message from the generator (assistant, user, system, etc.)
    const newMessage = event as Message

    // Capture complete thinking blocks for real-time display
    if (newMessage.type === 'assistant') {
      const thinkingBlock = (newMessage as any).message?.content?.find(
        (block: { type: string }) => block.type === 'thinking',
      )
      if (thinkingBlock?.type === 'thinking') {
        update.streamingThinking = {
          thinking: thinkingBlock.thinking,
          isStreaming: false,
          streamingEndedAt: Date.now(),
        }
      }
    }

    // Clear streaming text on complete message
    if (state.streamingText !== null) {
      update.streamingText = null
    }

    // Append the message, with special handling for compact boundaries
    // and ephemeral progress
    if (isCompactBoundaryMessage(newMessage)) {
      if (options.isFullscreen) {
        // Fullscreen: keep pre-compact messages for scrollback, but drop
        // everything before the *previous* boundary to bound O(n) cost.
        const boundary = findLastCompactBoundaryIndex(state.messages)
        const keepFrom = boundary >= 0 ? boundary : 0
        update.messages = [
          ...(state.messages.slice(keepFrom) as Message[]),
          newMessage,
        ]
      } else {
        // Non-fullscreen: replace all messages with just the boundary
        update.messages = [newMessage]
      }
      update.shouldRefreshConversationId = true
    } else if (
      newMessage.type === 'progress' &&
      isEphemeralToolProgress((newMessage as any).data?.type)
    ) {
      // Ephemeral progress: replace the last progress tick for the same
      // tool call instead of appending (prevents array blowup from
      // per-second ticks in Bash/Sleep).
      const msgs = state.messages as Message[]
      const last = msgs[msgs.length - 1]
      if (
        last?.type === 'progress' &&
        (last as any).parentToolUseID === (newMessage as any).parentToolUseID &&
        (last as any).data?.type === (newMessage as any).data?.type
      ) {
        const copy = msgs.slice()
        copy[copy.length - 1] = newMessage
        update.messages = copy
      } else {
        update.messages = [...msgs, newMessage]
      }
    } else {
      // Default: append
      update.messages = [...(state.messages as Message[]), newMessage]
    }

    return update
  }

  // -----------------------------------------------------------------------
  // Request start: new API call within the query turn
  // -----------------------------------------------------------------------
  if (event.type === 'stream_request_start') {
    update.streamMode = 'requesting'
    return update
  }

  // -----------------------------------------------------------------------
  // Stream events: SSE-style deltas from the API
  // -----------------------------------------------------------------------
  const streamEvent = event as StreamEvent

  if (streamEvent.event.type === 'message_start') {
    if ((streamEvent as any).ttftMs != null) {
      update.apiMetrics = { ttftMs: (streamEvent as any).ttftMs }
    }
    return update
  }

  if (streamEvent.event.type === 'message_stop') {
    update.streamMode = 'tool-use'
    update.streamingToolUses = []
    return update
  }

  switch (streamEvent.event.type) {
    case 'content_block_start': {
      // Clear any accumulated streaming text for the new block
      if (state.streamingText !== null) {
        update.streamingText = null
      }

      const contentBlock = (streamEvent.event as any).content_block
      if (!contentBlock) return update

      switch (contentBlock.type) {
        case 'thinking':
        case 'redacted_thinking':
          update.streamMode = 'thinking'
          return update
        case 'text':
          update.streamMode = 'responding'
          return update
        case 'tool_use': {
          update.streamMode = 'tool-input'
          const index = (streamEvent.event as any).index
          update.streamingToolUses = [
            ...state.streamingToolUses,
            {
              index,
              contentBlock,
              unparsedToolInput: '',
            },
          ] as StreamingToolUse[]
          return update
        }
        case 'server_tool_use':
        case 'web_search_tool_result':
        case 'code_execution_tool_result':
        case 'mcp_tool_use':
        case 'mcp_tool_result':
        case 'container_upload':
        case 'web_fetch_tool_result':
        case 'bash_code_execution_tool_result':
        case 'text_editor_code_execution_tool_result':
        case 'tool_search_tool_result':
        case 'compaction':
          update.streamMode = 'tool-input'
          return update
        default:
          // Connector text and other block types
          update.streamMode = 'responding'
          return update
      }
    }

    case 'content_block_delta': {
      const delta = (streamEvent.event as any).delta
      if (!delta) return update

      switch (delta.type) {
        case 'text_delta': {
          const deltaText: string = delta.text
          update.responseLengthDelta = deltaText.length
          update.streamingText = (state.streamingText ?? '') + deltaText
          return update
        }
        case 'input_json_delta': {
          const partialJson: string = delta.partial_json
          const index = (streamEvent.event as any).index
          update.responseLengthDelta = partialJson.length

          const existingToolUses = state.streamingToolUses
          const element = existingToolUses.find(
            tu => tu.index === index,
          )
          if (element) {
            update.streamingToolUses = [
              ...existingToolUses.filter(tu => tu !== element),
              {
                ...element,
                unparsedToolInput: element.unparsedToolInput + partialJson,
              },
            ] as StreamingToolUse[]
          }
          return update
        }
        case 'thinking_delta': {
          update.responseLengthDelta = (delta.thinking as string).length
          return update
        }
        case 'signature_delta':
          // Signatures are not model output — exclude from response length
          return update
        default:
          return update
      }
    }

    case 'content_block_stop':
      return update

    case 'message_delta':
      update.streamMode = 'responding'
      return update

    default:
      update.streamMode = 'responding'
      return update
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the last compact boundary in a messages array.
 * Pure reimplementation to avoid importing from utils/messages.ts
 * (which has React-adjacent dependencies in some paths).
 */
function findLastCompactBoundaryIndex(messages: readonly Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCompactBoundaryMessage(messages[i]!)) {
      return i
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// Convenience: apply an update to a state snapshot
// ---------------------------------------------------------------------------

/**
 * Apply a `StreamStateUpdate` to a `StreamState` snapshot, producing a new
 * snapshot. Purely functional — neither input is mutated.
 *
 * This is a convenience for callers that manage state as a single object
 * (e.g., headless runner, tests). React-based callers will typically apply
 * individual fields to their respective useState hooks instead.
 */
export function applyStreamUpdate(
  state: StreamState,
  update: StreamStateUpdate,
): StreamState {
  return {
    messages: update.messages ?? (state.messages as Message[]),
    streamingToolUses:
      update.streamingToolUses ?? (state.streamingToolUses as StreamingToolUse[]),
    responseLength:
      state.responseLength + (update.responseLengthDelta ?? 0),
    streamingThinking:
      update.streamingThinking !== undefined
        ? update.streamingThinking
        : state.streamingThinking,
    streamingText:
      update.streamingText !== undefined
        ? update.streamingText
        : state.streamingText,
  }
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh `StreamState` for the start of a new query turn.
 */
export function createInitialStreamState(
  messages: Message[] = [],
): StreamState {
  return {
    messages,
    streamingToolUses: [],
    responseLength: 0,
    streamingThinking: null,
    streamingText: null,
  }
}
