/**
 * Provider-neutral internal message types.
 *
 * These types form the canonical internal representation of messages,
 * content blocks, streaming events, and usage data. They are intentionally
 * decoupled from any provider SDK (Anthropic, OpenAI, etc.) so that:
 *
 *   1. Business logic (query loop, tool execution, compaction, UI) operates
 *      on a single vocabulary regardless of backend.
 *   2. Provider-specific quirks are isolated to thin converter modules
 *      in `src/services/api/converters/`.
 *   3. New providers can be added by writing a converter — no changes to
 *      core code.
 *
 * The vocabulary is intentionally aligned with the Vercel AI SDK where
 * possible (hyphenated type discriminators, camelCase field names, 4-role
 * model) since that is the target multi-provider abstraction.
 *
 * @see docs/ai-sdk-migration-map.md for the full migration plan.
 */

// ═══════════════════════════════════════════════════════════════════
// Content Parts (the building blocks of message content)
// ═══════════════════════════════════════════════════════════════════

export interface InternalTextPart {
  type: 'text'
  text: string
}

export interface InternalReasoningPart {
  type: 'reasoning'
  text: string
  /** True when the model returned a redacted thinking block (Anthropic-specific). */
  redacted?: boolean
  /**
   * Opaque provider data needed to round-trip redacted blocks back to the
   * originating provider. Anthropic requires the original `data` field for
   * redacted_thinking blocks to be preserved in subsequent requests.
   */
  providerData?: unknown
  /** Signature for redacted thinking blocks (Anthropic-specific round-trip). */
  signature?: string
}

export interface InternalToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: unknown // JSON-serializable
  /** True if the tool was executed server-side (e.g., Anthropic web_search). */
  providerExecuted?: boolean
}

export interface InternalToolResultPart {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  output: InternalToolResultOutput
}

export type InternalToolResultOutput =
  | { type: 'text'; value: string }
  | { type: 'error'; value: string }
  | { type: 'json'; value: unknown }
  | { type: 'denied'; reason?: string }
  | { type: 'image'; data: string; mimeType: string } // base64
  | { type: 'multi'; parts: InternalToolResultOutput[] }

export interface InternalImagePart {
  type: 'image'
  /** base64 data or URL */
  data: string
  mimeType: string
}

export interface InternalFilePart {
  type: 'file'
  data: string | Uint8Array
  mimeType: string
  filename?: string
}

/**
 * Connector text injected between content blocks by Anthropic.
 * Preserved for round-tripping — stripped before sending to non-Anthropic providers.
 */
export interface InternalConnectorTextPart {
  type: 'connector-text'
  text: string
}

// ── Part unions by role ──────────────────────────────────────────

export type InternalAssistantPart =
  | InternalTextPart
  | InternalReasoningPart
  | InternalToolCallPart
  | InternalConnectorTextPart

export type InternalUserPart =
  | InternalTextPart
  | InternalImagePart
  | InternalFilePart

export type InternalToolPart = InternalToolResultPart

// ═══════════════════════════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════════════════════════

export interface InternalSystemMessage {
  role: 'system'
  content: string
}

export interface InternalUserMessage {
  role: 'user'
  content: string | InternalUserPart[]
}

export interface InternalAssistantMessage {
  role: 'assistant'
  content: string | InternalAssistantPart[]
}

/**
 * Dedicated tool-result role. Anthropic embeds tool results inside `user`
 * messages; the internal format (and AI SDK) use a separate role. Conversion
 * between the two happens in the Anthropic converter.
 */
export interface InternalToolMessage {
  role: 'tool'
  content: InternalToolPart[]
}

export type InternalMessage =
  | InternalSystemMessage
  | InternalUserMessage
  | InternalAssistantMessage
  | InternalToolMessage

// ═══════════════════════════════════════════════════════════════════
// Streaming Events
// ═══════════════════════════════════════════════════════════════════

export type InternalStreamPart =
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'reasoning-end'; id: string; signature?: string }
  | { type: 'tool-input-start'; id: string; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      input: unknown
    }
  | {
      type: 'step-finish'
      usage: InternalUsage
      finishReason: InternalFinishReason
    }
  | {
      type: 'finish'
      totalUsage: InternalUsage
      finishReason: InternalFinishReason
    }
  | { type: 'error'; error: unknown }

// ═══════════════════════════════════════════════════════════════════
// Usage & Finish Reason
// ═══════════════════════════════════════════════════════════════════

export type InternalFinishReason =
  | 'stop'
  | 'tool-calls'
  | 'length'
  | 'content-filter'
  | 'error'
  | 'other'

export interface InternalUsage {
  inputTokens: number
  outputTokens: number
  /** Tokens read from prompt cache (Anthropic, some OpenAI models). */
  cacheReadTokens?: number
  /** Tokens written to prompt cache on this request. */
  cacheWriteTokens?: number
  /** Tokens used by extended thinking / reasoning. */
  reasoningTokens?: number
  /** Provider-specific usage extensions (web search requests, etc.). */
  providerUsage?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════
// Provider Options (pass-through for provider-specific features)
// ═══════════════════════════════════════════════════════════════════

/**
 * Bag of provider-specific options that get passed through to the converter
 * layer. This is how cache control, beta headers, effort params, etc. are
 * communicated without polluting the internal types.
 */
export interface InternalProviderOptions {
  /** Anthropic-specific: cache_control markers for prompt caching. */
  cacheControl?: { type: 'ephemeral' | 'ephemeral_1h' | 'ephemeral_5m' }
  /** Anthropic-specific: beta feature headers. */
  betaHeaders?: string[]
  /** Anthropic-specific: effort / thinking budget. */
  effort?: { type: 'thinking_budget'; thinking_budget_tokens?: number }
  /** Catch-all for other provider-specific options. */
  [key: string]: unknown
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** Narrow an InternalMessage to a specific role. */
export function isAssistantMessage(
  msg: InternalMessage,
): msg is InternalAssistantMessage {
  return msg.role === 'assistant'
}

export function isUserMessage(
  msg: InternalMessage,
): msg is InternalUserMessage {
  return msg.role === 'user'
}

export function isToolMessage(
  msg: InternalMessage,
): msg is InternalToolMessage {
  return msg.role === 'tool'
}

export function isSystemMessage(
  msg: InternalMessage,
): msg is InternalSystemMessage {
  return msg.role === 'system'
}

/** Extract all tool-call parts from an assistant message's content. */
export function getToolCalls(
  msg: InternalAssistantMessage,
): InternalToolCallPart[] {
  if (typeof msg.content === 'string') return []
  return msg.content.filter(
    (p): p is InternalToolCallPart => p.type === 'tool-call',
  )
}

/** Extract all text parts from an assistant message, concatenated. */
export function getTextContent(msg: InternalAssistantMessage): string {
  if (typeof msg.content === 'string') return msg.content
  return msg.content
    .filter((p): p is InternalTextPart => p.type === 'text')
    .map(p => p.text)
    .join('')
}

/** Check if an assistant message contains any tool calls. */
export function hasToolCalls(msg: InternalAssistantMessage): boolean {
  if (typeof msg.content === 'string') return false
  return msg.content.some(p => p.type === 'tool-call')
}

/** Create a simple text tool result output. */
export function textOutput(value: string): InternalToolResultOutput {
  return { type: 'text', value }
}

/** Create an error tool result output. */
export function errorOutput(value: string): InternalToolResultOutput {
  return { type: 'error', value }
}

/** Create a denied tool result output. */
export function deniedOutput(reason?: string): InternalToolResultOutput {
  return { type: 'denied', reason }
}
