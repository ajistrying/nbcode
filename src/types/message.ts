/**
 * Core message type definitions for the Noble Base Code conversation system.
 *
 * This file was reconstructed from usage patterns across the codebase.
 * Originally build-time generated in Anthropic's source, it was missing
 * from the fork. All 20+ import sites depend on these types.
 *
 * These types currently use Anthropic SDK types for message content.
 * The AI SDK migration (Phase 1C) will gradually replace inner types
 * with the provider-neutral types from `./internal-messages.ts`.
 */
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaRawMessageStreamEvent,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { APIError } from '@anthropic-ai/sdk'
import type { UUID } from 'crypto'
import type { ToolProgressData } from './tools.js'
import type { HookProgress } from './hooks.js'
import type { SDKAssistantMessageError } from '../entrypoints/agentSdkTypes.js'

// ═══════════════════════════════════════════════════════════════════
// Usage types
// ═══════════════════════════════════════════════════════════════════

export type Usage = BetaUsage

// ═══════════════════════════════════════════════════════════════════
// Message Origins
// ═══════════════════════════════════════════════════════════════════

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification'; taskId: string }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }

// ═══════════════════════════════════════════════════════════════════
// Stop Hook Info
// ═══════════════════════════════════════════════════════════════════

export type StopHookInfo = {
  hookName: string
  output: string
  decision: 'allow' | 'deny' | 'ask'
  message?: string
  durationMs?: number
}

// ═══════════════════════════════════════════════════════════════════
// System message level
// ═══════════════════════════════════════════════════════════════════

export type SystemMessageLevel = 'info' | 'warn' | 'error'

// ═══════════════════════════════════════════════════════════════════
// Compact direction
// ═══════════════════════════════════════════════════════════════════

export type PartialCompactDirection = 'from' | 'to'

// ═══════════════════════════════════════════════════════════════════
// Core Message Types
// ═══════════════════════════════════════════════════════════════════

/** An assistant (model) response message. */
export type AssistantMessage = {
  type: 'assistant'
  uuid: string
  timestamp: string
  /** The raw API response message. Content is BetaContentBlock[]. */
  message: BetaMessage & {
    content: BetaContentBlock[]
    context_management?: unknown
  }
  requestId?: string
  apiError?: string
  error?: SDKAssistantMessageError
  errorDetails?: string
  isApiErrorMessage?: boolean
  isVirtual?: true
  /** Internal research metadata (ant-only). */
  research?: unknown
  /** Advisor model used for this message. */
  advisorModel?: string
}

/** A user-submitted message (prompt, tool result, or attachment). */
export type UserMessage = {
  type: 'user'
  uuid: string
  timestamp: string
  message: {
    role: 'user'
    content: string | BetaContentBlockParam[]
  }
  /** Summary of tool result for display. */
  toolUseResult?: string
  /** UUID of the assistant message that triggered this tool use. */
  sourceToolAssistantUUID?: string
  /** Optional direction for partial compact. */
  direction?: PartialCompactDirection
  /** Origin of this message (human, task-notification, coordinator, channel). */
  origin?: MessageOrigin
}

// ═══════════════════════════════════════════════════════════════════
// System Message Types (35+ subtypes)
// ═══════════════════════════════════════════════════════════════════

/** Base shape shared by all system messages. */
type SystemMessageBase = {
  type: 'system'
  timestamp: string
  uuid: string
  isMeta?: boolean
}

export type SystemInformationalMessage = SystemMessageBase & {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemPermissionRetryMessage = SystemMessageBase & {
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
}

export type SystemBridgeStatusMessage = SystemMessageBase & {
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
}

export type SystemScheduledTaskFireMessage = SystemMessageBase & {
  subtype: 'scheduled_task_fire'
  content: string
}

export type SystemStopHookSummaryMessage = SystemMessageBase & {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason: string | undefined
  hasOutput: boolean
  level: SystemMessageLevel
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
}

export type SystemTurnDurationMessage = SystemMessageBase & {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}

export type SystemAwaySummaryMessage = SystemMessageBase & {
  subtype: 'away_summary'
  content: string
}

export type SystemMemorySavedMessage = SystemMessageBase & {
  subtype: 'memory_saved'
  writtenPaths: string[]
}

export type SystemAgentsKilledMessage = SystemMessageBase & {
  subtype: 'agents_killed'
}

export type SystemApiMetricsMessage = SystemMessageBase & {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}

export type SystemLocalCommandMessage = SystemMessageBase & {
  subtype: 'local_command'
  content: string
  level: SystemMessageLevel
}

export type SystemCompactBoundaryMessage = SystemMessageBase & {
  subtype: 'compact_boundary'
  content: string
  level: SystemMessageLevel
  compactMetadata: {
    trigger: 'manual' | 'auto'
    preTokens: number
    userContext?: string
    messagesSummarized?: number
  }
  logicalParentUuid?: UUID
}

export type SystemMicrocompactBoundaryMessage = SystemMessageBase & {
  subtype: 'microcompact_boundary'
  content: string
  level: SystemMessageLevel
  microcompactMetadata: {
    trigger: 'auto'
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export type SystemAPIErrorMessage = SystemMessageBase & {
  subtype: 'api_error'
  level: 'error'
  cause?: Error
  error: APIError
  retryInMs: number
  retryAttempt: number
  maxRetries: number
}

/** Union of all system message subtypes. */
export type SystemMessage =
  | SystemInformationalMessage
  | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage

// ═══════════════════════════════════════════════════════════════════
// Progress Messages
// ═══════════════════════════════════════════════════════════════════

export type Progress = ToolProgressData | HookProgress

export type ProgressMessage<P extends Progress = Progress> = {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID: string
  uuid: string
  timestamp: string
}

// ═══════════════════════════════════════════════════════════════════
// Attachment Messages
// ═══════════════════════════════════════════════════════════════════

export type AttachmentMessage = {
  type: 'attachment'
  uuid: string
  timestamp: string
  message: {
    role: 'user'
    content: BetaContentBlockParam[]
  }
  label?: string
  sourceToolAssistantUUID?: string
}

// ═══════════════════════════════════════════════════════════════════
// Tool Use Summary Messages
// ═══════════════════════════════════════════════════════════════════

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: string
  timestamp: string
}

// ═══════════════════════════════════════════════════════════════════
// Stream & Control Types
// ═══════════════════════════════════════════════════════════════════

/** Wraps a raw Anthropic stream event for pass-through to UI. */
export type StreamEvent = {
  type: 'stream_event'
  event: BetaRawMessageStreamEvent
  ttftMs?: number
}

/** Emitted at the start of each API request within the query loop. */
export type RequestStartEvent = {
  type: 'stream_request_start'
}

/** Tombstone: signals that a previously-yielded message should be removed. */
export type TombstoneMessage = {
  type: 'tombstone'
  message: AssistantMessage
}

// ═══════════════════════════════════════════════════════════════════
// Normalized Messages (single-block variants for rendering)
// ═══════════════════════════════════════════════════════════════════

/**
 * A normalized assistant message has exactly one content block.
 * Used for rendering individual blocks in the message list.
 */
export type NormalizedAssistantMessage = Omit<AssistantMessage, 'message'> & {
  message: Omit<AssistantMessage['message'], 'content'> & {
    content: [BetaContentBlock]
  }
}

/**
 * A normalized user message has exactly one content block or string.
 */
export type NormalizedUserMessage = UserMessage

export type NormalizedMessage = NormalizedAssistantMessage | NormalizedUserMessage

// ═══════════════════════════════════════════════════════════════════
// Message Union
// ═══════════════════════════════════════════════════════════════════

/**
 * The top-level message union. All message types in the conversation
 * transcript are one of these variants, discriminated by `type`.
 */
export type Message =
  | AssistantMessage
  | UserMessage
  | SystemMessage
  | ProgressMessage
  | AttachmentMessage
  | ToolUseSummaryMessage
