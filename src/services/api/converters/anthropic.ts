/**
 * Bidirectional converter: Internal message format <-> Anthropic SDK types.
 *
 * This module is the ONLY place that should import Anthropic SDK message types
 * outside of `claude.ts` and `client.ts`. All other code operates on the
 * internal format defined in `src/types/internal-messages.ts`.
 *
 * Key structural differences handled here:
 *   1. Tool results: Anthropic embeds in `user` messages; internal format
 *      uses dedicated `tool` role.
 *   2. Type discriminators: Anthropic uses underscores (`tool_use`, `tool_result`);
 *      internal uses hyphens (`tool-call`, `tool-result`).
 *   3. Field names: Anthropic uses `tool_use_id`, `id`, `name`;
 *      internal uses `toolCallId`, `toolName`.
 *   4. Thinking: Anthropic uses `thinking`/`redacted_thinking`;
 *      internal uses `reasoning` with `redacted` flag.
 *   5. Usage: Anthropic uses snake_case; internal uses camelCase.
 */
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam as MessageParam,
  BetaRawMessageStreamEvent,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  InternalAssistantMessage,
  InternalAssistantPart,
  InternalMessage,
  InternalStreamPart,
  InternalToolCallPart,
  InternalToolMessage,
  InternalToolPart,
  InternalToolResultOutput,
  InternalToolResultPart,
  InternalUsage,
  InternalUserMessage,
  InternalUserPart,
  InternalFinishReason,
} from '../../../types/internal-messages.js'

// ═══════════════════════════════════════════════════════════════════
// Anthropic -> Internal
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an Anthropic MessageParam (the format sent to/received from the API)
 * into one or more InternalMessages. A single Anthropic user message may yield
 * both an InternalUserMessage and an InternalToolMessage if it contains
 * tool_result blocks alongside text/image blocks.
 */
export function anthropicMessageToInternal(
  msg: MessageParam,
): InternalMessage[] {
  if (msg.role === 'user') {
    return convertAnthropicUserMessage(msg)
  }
  if (msg.role === 'assistant') {
    return [convertAnthropicAssistantMessage(msg)]
  }
  return []
}

function convertAnthropicUserMessage(
  msg: MessageParam & { role: 'user' },
): InternalMessage[] {
  if (typeof msg.content === 'string') {
    return [{ role: 'user', content: msg.content }]
  }

  const userParts: InternalUserPart[] = []
  const toolParts: InternalToolPart[] = []

  for (const block of msg.content as BetaContentBlockParam[]) {
    const blockType = (block as { type: string }).type

    switch (blockType) {
      case 'text': {
        const b = block as { text: string }
        userParts.push({ type: 'text', text: b.text })
        break
      }
      case 'image': {
        const b = block as {
          source: { type: string; media_type: string; data: string }
        }
        userParts.push({
          type: 'image',
          data: b.source.data,
          mimeType: b.source.media_type,
        })
        break
      }
      case 'document': {
        const b = block as {
          source: { type: string; media_type: string; data: string }
        }
        userParts.push({
          type: 'file',
          data: b.source.data,
          mimeType: b.source.media_type,
        })
        break
      }
      case 'tool_result': {
        const b = block as BetaToolResultBlockParam
        toolParts.push({
          type: 'tool-result',
          toolCallId: b.tool_use_id,
          toolName: '', // Anthropic doesn't include toolName in results
          output: anthropicToolResultToOutput(b),
        })
        break
      }
      // Skip thinking, redacted_thinking, connector_text in user messages
      default:
        break
    }
  }

  const messages: InternalMessage[] = []
  if (userParts.length > 0) {
    messages.push({ role: 'user', content: userParts })
  }
  if (toolParts.length > 0) {
    messages.push({ role: 'tool', content: toolParts })
  }
  // Edge case: no recognized parts — emit empty user message
  if (messages.length === 0) {
    messages.push({ role: 'user', content: '' })
  }
  return messages
}

function convertAnthropicAssistantMessage(
  msg: MessageParam & { role: 'assistant' },
): InternalAssistantMessage {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content }
  }

  const parts: InternalAssistantPart[] = []
  for (const block of msg.content as BetaContentBlock[]) {
    const blockType = (block as { type: string }).type

    switch (blockType) {
      case 'text': {
        const b = block as { text: string }
        parts.push({ type: 'text', text: b.text })
        break
      }
      case 'tool_use': {
        const b = block as ToolUseBlock
        parts.push({
          type: 'tool-call',
          toolCallId: b.id,
          toolName: b.name,
          input: b.input,
        })
        break
      }
      case 'thinking': {
        const b = block as { thinking: string; signature?: string }
        parts.push({
          type: 'reasoning',
          text: b.thinking,
          signature: b.signature,
        })
        break
      }
      case 'redacted_thinking': {
        const b = block as { data?: string; signature?: string }
        parts.push({
          type: 'reasoning',
          text: '',
          redacted: true,
          providerData: b.data,
          signature: b.signature,
        })
        break
      }
      case 'server_tool_use': {
        const b = block as { id: string; name: string; input: unknown }
        parts.push({
          type: 'tool-call',
          toolCallId: b.id,
          toolName: b.name,
          input: b.input,
          providerExecuted: true,
        })
        break
      }
      // connector_text preserved for round-tripping
      case 'connector_text': {
        const b = block as { text: string }
        parts.push({ type: 'connector-text', text: b.text })
        break
      }
      default:
        break
    }
  }

  return { role: 'assistant', content: parts }
}

function anthropicToolResultToOutput(
  block: BetaToolResultBlockParam,
): InternalToolResultOutput {
  if (block.is_error) {
    const text =
      typeof block.content === 'string'
        ? block.content
        : Array.isArray(block.content)
          ? block.content
              .filter(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              )
              .map(b => b.text)
              .join('\n')
          : ''
    return { type: 'error', value: text }
  }

  if (typeof block.content === 'string') {
    return { type: 'text', value: block.content }
  }

  if (Array.isArray(block.content)) {
    const texts = block.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
    if (texts.length === 1) return { type: 'text', value: texts[0]! }
    if (texts.length > 1) return { type: 'text', value: texts.join('\n') }

    // Check for image results
    const images = block.content.filter(
      (b): b is { type: 'image'; source: { data: string; media_type: string } } =>
        b.type === 'image',
    )
    if (images.length > 0) {
      return {
        type: 'multi',
        parts: [
          ...texts.map(t => ({ type: 'text' as const, value: t })),
          ...images.map(i => ({
            type: 'image' as const,
            data: i.source.data,
            mimeType: i.source.media_type,
          })),
        ],
      }
    }
  }

  return { type: 'text', value: '' }
}

// ═══════════════════════════════════════════════════════════════════
// Internal -> Anthropic
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert InternalMessages back to Anthropic MessageParam[].
 *
 * Key transformation: InternalToolMessages are merged into the preceding
 * or following user message (Anthropic requires tool_result blocks to live
 * inside user messages, not in a separate role).
 */
export function internalToAnthropicMessages(
  messages: InternalMessage[],
): MessageParam[] {
  const result: MessageParam[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!

    switch (msg.role) {
      case 'system':
        // System messages are handled separately in Anthropic API (not in messages array)
        break

      case 'user':
        result.push(internalUserToAnthropic(msg))
        break

      case 'assistant':
        result.push(internalAssistantToAnthropic(msg))
        break

      case 'tool': {
        // Merge tool results into a user message (Anthropic format)
        const toolBlocks = msg.content.map(part =>
          internalToolResultToAnthropic(part),
        )
        result.push({ role: 'user', content: toolBlocks })
        break
      }
    }
  }

  return result
}

function internalUserToAnthropic(msg: InternalUserMessage): MessageParam {
  if (typeof msg.content === 'string') {
    return { role: 'user', content: msg.content }
  }

  const blocks: BetaContentBlockParam[] = msg.content.map(part => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text } as BetaContentBlockParam
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mimeType,
            data: part.data,
          },
        } as BetaContentBlockParam
      case 'file':
        return {
          type: 'document',
          source: {
            type: 'base64',
            media_type: part.mimeType,
            data: typeof part.data === 'string' ? part.data : '',
          },
        } as BetaContentBlockParam
    }
  })

  return { role: 'user', content: blocks }
}

function internalAssistantToAnthropic(
  msg: InternalAssistantMessage,
): MessageParam {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content }
  }

  const blocks: BetaContentBlockParam[] = []

  for (const part of msg.content) {
    switch (part.type) {
      case 'text':
        blocks.push({ type: 'text', text: part.text } as BetaContentBlockParam)
        break
      case 'tool-call':
        blocks.push({
          type: 'tool_use',
          id: part.toolCallId,
          name: part.toolName,
          input: part.input,
        } as unknown as BetaContentBlockParam)
        break
      case 'reasoning':
        if (part.redacted) {
          blocks.push({
            type: 'redacted_thinking',
            data: part.providerData,
            ...(part.signature && { signature: part.signature }),
          } as unknown as BetaContentBlockParam)
        } else {
          blocks.push({
            type: 'thinking',
            thinking: part.text,
            ...(part.signature && { signature: part.signature }),
          } as unknown as BetaContentBlockParam)
        }
        break
      case 'connector-text':
        blocks.push({
          type: 'connector_text',
          text: part.text,
        } as unknown as BetaContentBlockParam)
        break
    }
  }

  return { role: 'assistant', content: blocks }
}

export function internalToolResultToAnthropic(
  part: InternalToolResultPart,
): BetaToolResultBlockParam {
  const base: BetaToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: part.toolCallId,
  }

  switch (part.output.type) {
    case 'text':
      return { ...base, content: part.output.value }
    case 'error':
      return { ...base, content: part.output.value, is_error: true }
    case 'json':
      return {
        ...base,
        content: JSON.stringify(part.output.value),
      }
    case 'denied':
      return {
        ...base,
        content: part.output.reason ?? 'Permission denied',
        is_error: true,
      }
    case 'image':
      return {
        ...base,
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.output.mimeType,
              data: part.output.data,
            },
          },
        ] as unknown as BetaToolResultBlockParam['content'],
      }
    case 'multi':
      return {
        ...base,
        content: part.output.parts
          .map(p => {
            if (p.type === 'text' || p.type === 'error')
              return { type: 'text' as const, text: p.value }
            if (p.type === 'image')
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: p.mimeType,
                  data: p.data,
                },
              }
            return null
          })
          .filter(Boolean) as unknown as BetaToolResultBlockParam['content'],
      }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Content block conversions (for incremental migration)
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a single Anthropic content block to an internal part.
 * Useful for incremental migration where individual blocks need conversion.
 */
export function anthropicContentBlockToInternalPart(
  block: BetaContentBlock,
): InternalAssistantPart | null {
  const blockType = (block as { type: string }).type

  switch (blockType) {
    case 'text':
      return { type: 'text', text: (block as { text: string }).text }
    case 'tool_use': {
      const b = block as BetaToolUseBlock
      return {
        type: 'tool-call',
        toolCallId: b.id,
        toolName: b.name,
        input: b.input,
      }
    }
    case 'thinking': {
      const b = block as { thinking: string; signature?: string }
      return { type: 'reasoning', text: b.thinking, signature: b.signature }
    }
    case 'redacted_thinking': {
      const b = block as { data?: string; signature?: string }
      return {
        type: 'reasoning',
        text: '',
        redacted: true,
        providerData: b.data,
        signature: b.signature,
      }
    }
    default:
      return null
  }
}

/**
 * Convert an internal assistant part back to an Anthropic content block.
 */
export function internalPartToAnthropicContentBlock(
  part: InternalAssistantPart,
): BetaContentBlock {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text } as BetaContentBlock
    case 'tool-call':
      return {
        type: 'tool_use',
        id: part.toolCallId,
        name: part.toolName,
        input: part.input,
      } as unknown as BetaContentBlock
    case 'reasoning':
      if (part.redacted) {
        return {
          type: 'redacted_thinking',
          data: part.providerData,
          ...(part.signature && { signature: part.signature }),
        } as unknown as BetaContentBlock
      }
      return {
        type: 'thinking',
        thinking: part.text,
        ...(part.signature && { signature: part.signature }),
      } as unknown as BetaContentBlock
    case 'connector-text':
      return {
        type: 'connector_text',
        text: part.text,
      } as unknown as BetaContentBlock
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stream event conversion
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an Anthropic stream event to an InternalStreamPart.
 * Returns null for events that have no internal equivalent (e.g., ping).
 */
export function anthropicStreamEventToInternal(
  event: BetaRawMessageStreamEvent,
  /** Monotonically increasing block index tracker — caller manages this. */
  blockIndex: { current: number },
): InternalStreamPart | null {
  switch (event.type) {
    case 'message_start':
      return null // Handled at higher level

    case 'content_block_start': {
      const block = (event as { content_block: { type: string } }).content_block
      const idx = String(blockIndex.current++)

      switch (block.type) {
        case 'text':
          return { type: 'text-start', id: idx }
        case 'thinking':
          return { type: 'reasoning-start', id: idx }
        case 'tool_use': {
          const tu = block as { id: string; name: string }
          return {
            type: 'tool-input-start',
            id: idx,
            toolCallId: tu.id,
            toolName: tu.name,
          }
        }
        default:
          return null
      }
    }

    case 'content_block_delta': {
      const delta = (event as { delta: { type: string } }).delta
      const idx = String(
        (event as { index: number }).index,
      )

      switch (delta.type) {
        case 'text_delta':
          return {
            type: 'text-delta',
            id: idx,
            text: (delta as { text: string }).text,
          }
        case 'thinking_delta':
          return {
            type: 'reasoning-delta',
            id: idx,
            text: (delta as { thinking: string }).thinking,
          }
        case 'input_json_delta':
          return {
            type: 'tool-input-delta',
            id: idx,
            delta: (delta as { partial_json: string }).partial_json,
          }
        default:
          return null
      }
    }

    case 'content_block_stop': {
      const idx = String(
        (event as { index: number }).index,
      )
      // We don't know the block type from the stop event alone.
      // The caller needs to track which block type this index corresponds to.
      // Return a generic end event — caller can refine.
      return { type: 'text-end', id: idx }
    }

    case 'message_delta': {
      const delta = event as {
        delta: { stop_reason?: string }
        usage?: { output_tokens?: number }
      }
      return {
        type: 'step-finish',
        usage: {
          inputTokens: 0, // Not available in message_delta
          outputTokens: delta.usage?.output_tokens ?? 0,
        },
        finishReason: anthropicStopReasonToInternal(
          delta.delta?.stop_reason,
        ),
      }
    }

    case 'message_stop':
      return null // Handled at higher level with accumulated usage

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Usage conversion
// ═══════════════════════════════════════════════════════════════════

/** Convert Anthropic usage to internal format. */
export function anthropicUsageToInternal(usage: BetaUsage): InternalUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens:
      (usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens ?? undefined,
    cacheWriteTokens:
      (usage as { cache_creation_input_tokens?: number })
        .cache_creation_input_tokens ?? undefined,
    providerUsage: {
      server_tool_use: (usage as { server_tool_use?: unknown }).server_tool_use,
      service_tier: (usage as { service_tier?: unknown }).service_tier,
    },
  }
}

/** Convert internal usage back to Anthropic format. */
export function internalUsageToAnthropic(usage: InternalUsage): BetaUsage {
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_creation_input_tokens: usage.cacheWriteTokens ?? 0,
    cache_read_input_tokens: usage.cacheReadTokens ?? 0,
    ...(usage.providerUsage?.server_tool_use && {
      server_tool_use: usage.providerUsage.server_tool_use,
    }),
    ...(usage.providerUsage?.service_tier !== undefined && {
      service_tier: usage.providerUsage.service_tier,
    }),
  } as BetaUsage
}

// ═══════════════════════════════════════════════════════════════════
// Finish reason mapping
// ═══════════════════════════════════════════════════════════════════

/** Map Anthropic stop_reason to internal finish reason. */
export function anthropicStopReasonToInternal(
  reason: string | undefined | null,
): InternalFinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool-calls'
    case 'max_tokens':
      return 'length'
    default:
      return 'other'
  }
}

/** Map internal finish reason to Anthropic stop_reason. */
export function internalFinishReasonToAnthropic(
  reason: InternalFinishReason,
): string {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'tool-calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}
