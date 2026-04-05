/**
 * Bidirectional converter: Internal message format <-> Vercel AI SDK types.
 *
 * Since the internal format is intentionally aligned with the AI SDK vocabulary,
 * these conversions are largely mechanical type renames. The biggest difference
 * is that the AI SDK uses specific union types per role (`UserModelMessage`,
 * `AssistantModelMessage`, `ToolModelMessage`) whereas our internal types use
 * a single discriminated union.
 *
 * This module imports from `ai` and `@ai-sdk/provider-utils` — the AI SDK
 * packages already installed for the OpenAI-compatible adapter.
 */
import type {
  ModelMessage,
  ToolResultPart,
} from '@ai-sdk/provider-utils'
import type {
  InternalAssistantMessage,
  InternalAssistantPart,
  InternalFinishReason,
  InternalMessage,
  InternalStreamPart,
  InternalToolCallPart,
  InternalToolMessage,
  InternalToolResultOutput,
  InternalToolResultPart,
  InternalUsage,
  InternalUserMessage,
  InternalUserPart,
} from '../../../types/internal-messages.js'

// ═══════════════════════════════════════════════════════════════════
// Internal -> AI SDK
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert InternalMessage[] to AI SDK ModelMessage[].
 * System messages are excluded (AI SDK handles them separately via the
 * `system` parameter in `streamText`/`generateText`).
 */
export function internalToAiSdkMessages(
  messages: InternalMessage[],
): ModelMessage[] {
  const result: ModelMessage[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        // AI SDK takes system as a separate parameter, not in messages
        break
      case 'user':
        result.push(internalUserToAiSdk(msg))
        break
      case 'assistant':
        result.push(internalAssistantToAiSdk(msg))
        break
      case 'tool':
        result.push(internalToolToAiSdk(msg))
        break
    }
  }

  return result
}

function internalUserToAiSdk(msg: InternalUserMessage): ModelMessage {
  if (typeof msg.content === 'string') {
    return { role: 'user', content: msg.content }
  }

  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType?: string }
    | { type: 'file'; data: string | Uint8Array; mimeType: string }
  > = []

  for (const part of msg.content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.text })
        break
      case 'image':
        parts.push({
          type: 'image',
          image: part.data.startsWith('data:')
            ? part.data
            : `data:${part.mimeType};base64,${part.data}`,
          mimeType: part.mimeType,
        })
        break
      case 'file':
        parts.push({
          type: 'file',
          data: part.data,
          mimeType: part.mimeType,
        })
        break
    }
  }

  if (parts.length === 1 && parts[0]!.type === 'text') {
    return { role: 'user', content: parts[0]!.text }
  }

  return { role: 'user', content: parts as any }
}

function internalAssistantToAiSdk(
  msg: InternalAssistantMessage,
): ModelMessage {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content }
  }

  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | {
        type: 'tool-call'
        toolCallId: string
        toolName: string
        input: unknown
      }
  > = []

  for (const part of msg.content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.text })
        break
      case 'reasoning':
        // Skip redacted blocks — AI SDK has no concept
        if (!part.redacted) {
          parts.push({ type: 'reasoning', text: part.text })
        }
        break
      case 'tool-call':
        parts.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        })
        break
      case 'connector-text':
        // Strip connector_text — it's Anthropic-specific
        break
    }
  }

  // If only text parts, join them
  const hasOnlyText = parts.every(p => p.type === 'text')
  if (hasOnlyText && parts.length > 0) {
    return {
      role: 'assistant',
      content: parts.map(p => (p as { text: string }).text).join(''),
    }
  }

  if (parts.length === 0) {
    return { role: 'assistant', content: '' }
  }

  return { role: 'assistant', content: parts as any }
}

function internalToolToAiSdk(msg: InternalToolMessage): ModelMessage {
  const results: ToolResultPart[] = msg.content.map(part => ({
    type: 'tool-result',
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    output: internalToolOutputToAiSdk(part.output),
  }))

  return { role: 'tool', content: results }
}

function internalToolOutputToAiSdk(
  output: InternalToolResultOutput,
): ToolResultPart['output'] {
  switch (output.type) {
    case 'text':
      return { type: 'text', value: output.value }
    case 'error':
      return { type: 'error-text', value: output.value }
    case 'json':
      return { type: 'text', value: JSON.stringify(output.value) }
    case 'denied':
      return {
        type: 'error-text',
        value: output.reason ?? 'Permission denied',
      }
    case 'image':
      // AI SDK doesn't have a native image result type — encode as text
      return {
        type: 'text',
        value: `[Image: ${output.mimeType}]`,
      }
    case 'multi':
      // Flatten multi results into text
      return {
        type: 'text',
        value: output.parts
          .map(p => {
            if (p.type === 'text' || p.type === 'error') return p.value
            if (p.type === 'image') return `[Image: ${p.mimeType}]`
            return ''
          })
          .filter(Boolean)
          .join('\n'),
      }
  }
}

// ═══════════════════════════════════════════════════════════════════
// AI SDK -> Internal
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert AI SDK ModelMessage[] to InternalMessage[].
 */
export function aiSdkToInternalMessages(
  messages: ModelMessage[],
): InternalMessage[] {
  const result: InternalMessage[] = []

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        if (typeof msg.content === 'string') {
          result.push({ role: 'system', content: msg.content })
        }
        break
      case 'user':
        result.push(aiSdkUserToInternal(msg))
        break
      case 'assistant':
        result.push(aiSdkAssistantToInternal(msg))
        break
      case 'tool':
        result.push(aiSdkToolToInternal(msg))
        break
    }
  }

  return result
}

function aiSdkUserToInternal(
  msg: ModelMessage & { role: 'user' },
): InternalUserMessage {
  if (typeof msg.content === 'string') {
    return { role: 'user', content: msg.content }
  }

  const content = msg.content as Array<{ type: string; [key: string]: unknown }>
  const parts: InternalUserPart[] = []

  for (const part of content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.text as string })
        break
      case 'image': {
        const imageData = part.image as string
        const mimeType = (part.mimeType as string) ?? 'image/png'
        // Strip data URL prefix if present
        const base64 = imageData.includes(',')
          ? imageData.split(',')[1]!
          : imageData
        parts.push({ type: 'image', data: base64, mimeType })
        break
      }
      case 'file':
        parts.push({
          type: 'file',
          data: part.data as string | Uint8Array,
          mimeType: part.mimeType as string,
          filename: part.filename as string | undefined,
        })
        break
    }
  }

  return { role: 'user', content: parts.length > 0 ? parts : '' }
}

function aiSdkAssistantToInternal(
  msg: ModelMessage & { role: 'assistant' },
): InternalAssistantMessage {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content }
  }

  const content = msg.content as Array<{ type: string; [key: string]: unknown }>
  const parts: InternalAssistantPart[] = []

  for (const part of content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.text as string })
        break
      case 'reasoning':
        parts.push({ type: 'reasoning', text: part.text as string })
        break
      case 'tool-call':
        parts.push({
          type: 'tool-call',
          toolCallId: part.toolCallId as string,
          toolName: part.toolName as string,
          input: part.input,
        })
        break
    }
  }

  return { role: 'assistant', content: parts }
}

function aiSdkToolToInternal(
  msg: ModelMessage & { role: 'tool' },
): InternalToolMessage {
  const content = msg.content as ToolResultPart[]
  const parts: InternalToolResultPart[] = content.map(part => ({
    type: 'tool-result',
    toolCallId: part.toolCallId,
    toolName: part.toolName ?? '',
    output: aiSdkToolOutputToInternal(part.output),
  }))

  return { role: 'tool', content: parts }
}

function aiSdkToolOutputToInternal(
  output: ToolResultPart['output'],
): InternalToolResultOutput {
  if (!output) return { type: 'text', value: '' }

  const o = output as { type: string; value?: unknown; reason?: string }
  switch (o.type) {
    case 'text':
      return { type: 'text', value: String(o.value ?? '') }
    case 'error-text':
      return { type: 'error', value: String(o.value ?? '') }
    case 'execution-denied':
      return { type: 'denied', reason: o.reason }
    default:
      return { type: 'text', value: String(o.value ?? '') }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stream part conversion (AI SDK fullStream -> Internal)
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an AI SDK TextStreamPart to an InternalStreamPart.
 * This is used when consuming AI SDK's `streamText().fullStream`.
 */
export function aiSdkStreamPartToInternal(
  part: { type: string; [key: string]: unknown },
): InternalStreamPart | null {
  switch (part.type) {
    case 'text-start':
      return { type: 'text-start', id: part.id as string }

    case 'text-delta':
      return {
        type: 'text-delta',
        id: part.id as string ?? '0',
        text: part.text as string,
      }

    case 'text-end':
      return { type: 'text-end', id: part.id as string }

    case 'reasoning-start':
      return { type: 'reasoning-start', id: part.id as string ?? '0' }

    case 'reasoning-delta':
      return {
        type: 'reasoning-delta',
        id: part.id as string ?? '0',
        text: part.text as string,
      }

    case 'reasoning-end':
      return {
        type: 'reasoning-end',
        id: part.id as string ?? '0',
        signature: part.signature as string | undefined,
      }

    case 'tool-input-start':
      return {
        type: 'tool-input-start',
        id: part.id as string,
        toolCallId: part.toolCallId as string ?? part.id as string,
        toolName: part.toolName as string,
      }

    case 'tool-input-delta':
      return {
        type: 'tool-input-delta',
        id: part.id as string,
        delta: part.delta as string,
      }

    case 'tool-input-end':
      return { type: 'tool-input-end', id: part.id as string }

    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId as string,
        toolName: part.toolName as string,
        input: part.input,
      }

    case 'finish-step':
    case 'step-finish':
      return {
        type: 'step-finish',
        usage: aiSdkUsageToInternal(
          part.usage as Record<string, number> | undefined,
        ),
        finishReason: aiSdkFinishReasonToInternal(
          part.finishReason as string | undefined,
        ),
      }

    case 'finish':
      return {
        type: 'finish',
        totalUsage: aiSdkUsageToInternal(
          (part.totalUsage ?? part.usage) as
            | Record<string, number>
            | undefined,
        ),
        finishReason: aiSdkFinishReasonToInternal(
          part.finishReason as string | undefined,
        ),
      }

    case 'error':
      return { type: 'error', error: part.error }

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Usage & finish reason
// ═══════════════════════════════════════════════════════════════════

/** Convert AI SDK LanguageModelUsage to internal usage. */
export function aiSdkUsageToInternal(
  usage: Record<string, unknown> | undefined,
): InternalUsage {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0 }
  }

  const details = usage.inputTokenDetails as
    | Record<string, number>
    | undefined

  return {
    inputTokens: (usage.inputTokens as number) ?? 0,
    outputTokens: (usage.outputTokens as number) ?? 0,
    cacheReadTokens: details?.cacheReadTokens,
    cacheWriteTokens: details?.cacheWriteTokens,
    reasoningTokens: (usage.reasoningTokens as number) ?? undefined,
  }
}

/** Convert internal usage to AI SDK LanguageModelUsage shape. */
export function internalUsageToAiSdk(
  usage: InternalUsage,
): Record<string, unknown> {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.reasoningTokens !== undefined && {
      reasoningTokens: usage.reasoningTokens,
    }),
    inputTokenDetails: {
      ...(usage.cacheReadTokens !== undefined && {
        cacheReadTokens: usage.cacheReadTokens,
      }),
      ...(usage.cacheWriteTokens !== undefined && {
        cacheWriteTokens: usage.cacheWriteTokens,
      }),
    },
  }
}

/** Map AI SDK finish reason string to internal. */
export function aiSdkFinishReasonToInternal(
  reason: string | undefined,
): InternalFinishReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'tool-calls':
      return 'tool-calls'
    case 'length':
      return 'length'
    case 'content-filter':
      return 'content-filter'
    case 'error':
      return 'error'
    default:
      return 'other'
  }
}

/** Map internal finish reason to AI SDK string. */
export function internalFinishReasonToAiSdk(
  reason: InternalFinishReason,
): string {
  return reason // Internal format matches AI SDK vocabulary
}
