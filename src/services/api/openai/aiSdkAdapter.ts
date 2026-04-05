/**
 * OpenAI-compatible adapter using Vercel AI SDK (@ai-sdk/openai-compatible).
 *
 * Drop-in replacement for the hand-rolled SSE parser in queryOpenAI.ts.
 * Has the same generator signature as queryModelWithStreaming from claude.ts,
 * yielding StreamEvent and AssistantMessage objects that the existing query
 * loop in query.ts can consume unchanged.
 */
import type {
  BetaContentBlock,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText } from 'ai'
import type { ModelMessage, ToolResultPart } from '@ai-sdk/provider-utils'
import { randomUUID } from 'crypto'
import type { Options } from '../claude.js'
import type { Tools } from '../../../Tool.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import {
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
} from '../../../utils/messages.js'
import { toolToAPISchema } from '../../../utils/api.js'
import {
  userMessageToMessageParam,
  assistantMessageToMessageParam,
} from '../claude.js'
import {
  buildSyntheticToolSearchSchema,
  getToolsForQuery,
  hasUndiscoveredTools,
  initClientToolSearch,
} from './clientToolSearch.js'
import {
  getTier1ContextWindow,
  getTier1MaxTokens,
  getSupportedModelPatterns,
  isTier1Model,
} from './modelRegistry.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'

// ── Types ────────────────────────────────────────────────────────
// Use loose event/message types since types/message.js is build-time generated
// and the Anthropic SDK types are too strict for our synthesized events.
type AnyStreamEvent = { type: 'stream_event'; event: unknown; ttftMs?: number }
type AnyAssistantMessage = {
  message: unknown
  requestId: string
  type: 'assistant'
  uuid: string
  timestamp: string
}
type YieldType = AnyStreamEvent | AnyAssistantMessage

// ── Config ───────────────────────────────────────────────────────
interface OpenAIConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  contextWindow: number
}

export function isOpenAICompatibleProvider(): boolean {
  return isEnvTruthy(process.env.OPENAI_COMPATIBLE)
}

function getOpenAIConfig(): OpenAIConfig {
  const baseUrl = process.env.OPENAI_BASE_URL
  if (!baseUrl) {
    throw new Error(
      'OPENAI_BASE_URL is required when OPENAI_COMPATIBLE=true (e.g. http://localhost:8000/v1)',
    )
  }

  const model = process.env.OPENAI_MODEL
  if (!model) {
    throw new Error(
      'OPENAI_MODEL is required when OPENAI_COMPATIBLE=true (e.g. Qwen/Qwen3-Coder-480B-A35B-Instruct)',
    )
  }

  if (!isTier1Model(model)) {
    const supported = getSupportedModelPatterns()
    throw new Error(
      `OPENAI_MODEL "${model}" is not a supported Tier 1 model.\n` +
        `Supported models:\n` +
        supported.map((p) => `  - ${p}`).join('\n'),
    )
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''), // strip trailing slashes
    apiKey: process.env.OPENAI_API_KEY || 'no-key',
    model,
    maxTokens: parseInt(
      process.env.OPENAI_MAX_TOKENS || String(getTier1MaxTokens(model)),
      10,
    ),
    contextWindow: parseInt(
      process.env.OPENAI_CONTEXT_WINDOW ||
        String(getTier1ContextWindow(model)),
      10,
    ),
  }
}

// ── Persistent discovered-tools state ────────────────────────────
// Survives across generator calls so tools the model discovered via
// ToolSearch in earlier turns are included in subsequent requests.
const sessionDiscoveredTools = new Set<string>()

/**
 * Scan the message history for past ToolSearch tool_use -> tool_result pairs.
 * When the Anthropic ToolSearchTool executes, it returns tool_reference blocks
 * in the tool_result content. We extract tool names from these and add them
 * to the session-level discovered set so they appear in the function schema.
 */
function scanForDiscoveredTools(messages: unknown[]): void {
  // Build a map of ToolSearch tool_use IDs
  const toolSearchIds = new Set<string>()
  for (const msg of messages) {
    const m = msg as { type?: string; message?: { content?: unknown[] } }
    if (m?.type !== 'assistant') continue
    const content = m.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as { type?: string; name?: string; id?: string }
      if (b.type === 'tool_use' && b.name === 'ToolSearch' && b.id) {
        toolSearchIds.add(b.id)
      }
    }
  }
  if (toolSearchIds.size === 0) return

  // Find matching tool_result blocks and extract tool_reference names
  for (const msg of messages) {
    const m = msg as { type?: string; message?: { content?: unknown[] } }
    if (m?.type !== 'user') continue
    const content = m.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as {
        type?: string
        tool_use_id?: string
        content?: unknown[] | string
      }
      if (b.type !== 'tool_result') continue
      if (!b.tool_use_id || !toolSearchIds.has(b.tool_use_id)) continue
      if (!Array.isArray(b.content)) continue
      for (const inner of b.content) {
        const ref = inner as { type?: string; tool_name?: string }
        if (ref.type === 'tool_reference' && ref.tool_name) {
          sessionDiscoveredTools.add(ref.tool_name)
        }
      }
    }
  }
}

// ── Message conversion: Anthropic -> AI SDK ──────────────────────

/**
 * Convert Anthropic system prompt blocks to a plain string for AI SDK.
 */
function systemPromptToString(
  systemPrompt: SystemPrompt,
): string | undefined {
  const blocks =
    typeof systemPrompt === 'string'
      ? [{ type: 'text' as const, text: systemPrompt }]
      : Array.isArray(systemPrompt)
        ? systemPrompt
        : []
  if (blocks.length === 0) return undefined
  const parts = blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/**
 * Convert Anthropic MessageParam[] to AI SDK ModelMessage[].
 * Handles user messages (text, images, tool_results) and assistant messages
 * (text, tool_use, thinking).
 */
function anthropicMessagesToAISdk(
  messages: { role: string; content: unknown }[],
): ModelMessage[] {
  const result: ModelMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push(...convertUserMessage(msg))
    } else if (msg.role === 'assistant') {
      result.push(convertAssistantMessage(msg))
    }
  }

  return result
}

function convertUserMessage(
  msg: { role: string; content: unknown },
): ModelMessage[] {
  if (typeof msg.content === 'string') {
    return [{ role: 'user', content: msg.content }]
  }

  const messages: ModelMessage[] = []
  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: URL | string; mimeType?: string }> = []
  const toolResults: ToolResultPart[] = []

  const blocks = msg.content as BetaContentBlockParam[]
  for (const block of blocks) {
    switch ((block as { type: string }).type) {
      case 'text':
        contentParts.push({
          type: 'text',
          text: (block as { text: string }).text,
        })
        break
      case 'image': {
        const imageBlock = block as {
          source: { type: string; media_type: string; data: string }
        }
        contentParts.push({
          type: 'image',
          image: `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}`,
        })
        break
      }
      case 'tool_result': {
        // Flush any pending content parts as a user message first
        if (contentParts.length > 0) {
          messages.push({ role: 'user', content: [...contentParts] })
          contentParts.length = 0
        }
        const toolResult = block as {
          tool_use_id: string
          content:
            | string
            | { type: string; text?: string; tool_name?: string }[]
          is_error?: boolean
        }
        let textContent: string
        if (typeof toolResult.content === 'string') {
          textContent = toolResult.content
        } else if (Array.isArray(toolResult.content)) {
          const textParts: string[] = []
          for (const b of toolResult.content) {
            if (b.type === 'text' && b.text) {
              textParts.push(b.text)
            } else if (b.type === 'tool_reference' && b.tool_name) {
              textParts.push(`Tool loaded: ${b.tool_name}`)
            }
          }
          textContent = textParts.join('\n')
        } else {
          textContent = ''
        }
        if (toolResult.is_error) {
          textContent = `[ERROR] ${textContent}`
        }
        toolResults.push({
          type: 'tool-result',
          toolCallId: toolResult.tool_use_id,
          toolName: '', // AI SDK doesn't require toolName for results
          output: { type: 'text', value: textContent },
        })
        break
      }
      case 'document':
        contentParts.push({
          type: 'text',
          text: '[Document content not supported by this model provider]',
        })
        break
      default:
        // Skip thinking, redacted_thinking, connector_text, etc.
        break
    }
  }

  // Flush remaining content parts
  if (contentParts.length > 0) {
    messages.push({ role: 'user', content: contentParts })
  }

  // Tool results go into a separate tool message
  if (toolResults.length > 0) {
    messages.push({ role: 'tool', content: toolResults })
  }

  return messages
}

function convertAssistantMessage(
  msg: { role: string; content: unknown },
): ModelMessage {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content }
  }

  const blocks = msg.content as { type: string; [key: string]: unknown }[]
  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  > = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const text = (block as { text: string }).text
        if (text) parts.push({ type: 'text', text })
        break
      }
      case 'tool_use': {
        const tu = block as { id: string; name: string; input: unknown }
        parts.push({
          type: 'tool-call',
          toolCallId: tu.id,
          toolName: tu.name,
          input: typeof tu.input === 'string' ? JSON.parse(tu.input) : tu.input,
        })
        break
      }
      case 'thinking': {
        const thinking = (block as { thinking: string }).thinking
        if (thinking) {
          parts.push({ type: 'reasoning', text: thinking })
        }
        break
      }
      // Skip redacted_thinking, connector_text, server_tool_use, etc.
      default:
        break
    }
  }

  if (parts.length === 0) {
    return { role: 'assistant', content: '' }
  }

  // If only text parts, join them
  const hasOnlyText = parts.every(p => p.type === 'text')
  if (hasOnlyText) {
    return {
      role: 'assistant',
      content: parts.map(p => (p as { text: string }).text).join(''),
    }
  }

  return { role: 'assistant', content: parts as any }
}

// ── Tool schema conversion: Anthropic -> AI SDK ──────────────────

/**
 * Convert Anthropic tool schemas to AI SDK tool format.
 * AI SDK streamText accepts tools as a Record<string, { parameters, description, execute? }>.
 * Since we do NOT want AI SDK to auto-execute tools (the query loop handles that),
 * we omit `execute` and just provide parameters + description.
 */
function anthropicToolsToAISdk(
  toolSchemas: BetaToolUnion[],
  syntheticToolSearchSchema?: object | null,
): Record<string, { description?: string; parameters: unknown }> {
  const result: Record<string, { description?: string; parameters: unknown }> = {}

  for (const tool of toolSchemas) {
    if (!('name' in tool) || typeof tool.name !== 'string') continue

    const description =
      'description' in tool && typeof tool.description === 'string'
        ? tool.description
        : undefined

    const inputSchema =
      'input_schema' in tool && tool.input_schema
        ? stripAnthropicSchemaExtensions(
            tool.input_schema as Record<string, unknown>,
          )
        : { type: 'object', properties: {} }

    result[tool.name] = {
      description,
      parameters: inputSchema,
    }
  }

  // Inject synthetic ToolSearch if present
  if (syntheticToolSearchSchema) {
    const schema = syntheticToolSearchSchema as {
      function: { name: string; description: string; parameters: unknown }
    }
    result[schema.function.name] = {
      description: schema.function.description,
      parameters: schema.function.parameters,
    }
  }

  return result
}

/**
 * Remove Anthropic-specific JSON schema extensions that OpenAI doesn't understand.
 */
function stripAnthropicSchemaExtensions(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...schema }
  delete result['cache_control']
  return result
}

// ── Observation masking ──────────────────────────────────────────

/**
 * Mask old tool results to reduce token usage when approaching the context
 * window limit. Same logic as messageTranslation.ts.
 */
function maskOldObservations(
  messages: { role: string; content: unknown }[],
  contextWindow: number,
  keepRecentTurns: number = 10,
): { role: string; content: unknown }[] {
  const estimatedTokens = JSON.stringify(messages).length / 4
  const threshold = contextWindow * 0.85

  if (estimatedTokens < threshold) {
    return messages
  }

  let turnsFromEnd = 0
  let maskBeforeIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      turnsFromEnd++
      if (turnsFromEnd === keepRecentTurns) {
        maskBeforeIndex = i
        break
      }
    }
  }

  if (maskBeforeIndex <= 0) {
    return messages
  }

  const result = [...messages]
  for (let i = 0; i < maskBeforeIndex; i++) {
    const msg = messages[i]!
    if (msg.role !== 'user' || typeof msg.content === 'string') continue

    const blocks = msg.content as BetaContentBlockParam[]
    const hasToolResult = blocks.some(
      (b) => (b as { type: string }).type === 'tool_result',
    )
    if (!hasToolResult) continue

    const maskedBlocks = blocks.map((block) => {
      const b = block as { type: string; content?: unknown; [key: string]: unknown }
      if (b.type !== 'tool_result') return block

      const content = b.content
      let originalLength = 0
      if (typeof content === 'string') {
        originalLength = content.length
      } else if (Array.isArray(content)) {
        originalLength = JSON.stringify(content).length
      }

      return {
        ...b,
        content: `[Output truncated - ${originalLength} chars]`,
      }
    })

    result[i] = { ...msg, content: maskedBlocks as typeof msg.content }
  }

  return result
}

// ── Finish reason mapping ────────────────────────────────────────

function aiSdkFinishReasonToAnthropic(
  reason: string,
): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'tool-calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content-filter':
      return 'end_turn'
    default:
      return null
  }
}

// ── Main adapter ─────────────────────────────────────────────────

export async function* queryModelOpenAIWithStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}: {
  messages: unknown[]
  systemPrompt: SystemPrompt
  thinkingConfig: unknown
  tools: Tools
  signal: AbortSignal
  options: Options
}): AsyncGenerator<YieldType, void> {
  const config = getOpenAIConfig()
  const start = Date.now()

  try {
    // ── 1. Normalize internal messages to API format ──
    const normalizedMessages = normalizeMessagesForAPI(
      messages as Parameters<typeof normalizeMessagesForAPI>[0],
      tools,
    )

    // Convert to Anthropic MessageParam format (reuse existing converters)
    const anthropicMessages = normalizedMessages.map((msg) => {
      if (msg.type === 'user') {
        return userMessageToMessageParam(msg, false, false)
      }
      return assistantMessageToMessageParam(msg, false, false)
    })

    // ── 2. Client-side tool search: partition tools ──
    scanForDiscoveredTools(messages as Parameters<typeof normalizeMessagesForAPI>[0])

    let activeTools = tools
    let toolSearchState: Awaited<ReturnType<typeof initClientToolSearch>> | null = null
    try {
      toolSearchState = await initClientToolSearch(tools)
      if (toolSearchState.deferredTools.size > 0) {
        for (const name of sessionDiscoveredTools) {
          toolSearchState.discoveredToolNames.add(name)
        }
        activeTools = getToolsForQuery(toolSearchState)
      } else {
        toolSearchState = null
      }
    } catch {
      toolSearchState = null
      activeTools = [...tools].filter(t => t.name !== 'ToolSearch')
    }

    // ── 3. Build tool schemas for active tools ──
    const toolSchemas: BetaToolUnion[] = []
    for (const tool of activeTools) {
      const schema = await toolToAPISchema(tool, {
        getToolPermissionContext: options.getToolPermissionContext,
        tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
        model: options.model,
      })
      toolSchemas.push(schema)
    }
    if (options.extraToolSchemas) {
      toolSchemas.push(...options.extraToolSchemas)
    }

    // ── 4. Mask old observations to manage context window ──
    const maskedMessages = maskOldObservations(
      anthropicMessages as { role: string; content: unknown }[],
      config.contextWindow,
    )

    // ── 5. Convert to AI SDK format ──
    const aiSdkMessages = anthropicMessagesToAISdk(
      maskedMessages as { role: string; content: unknown }[],
    )
    const systemStr = systemPromptToString(systemPrompt)

    // Build synthetic ToolSearch schema if needed
    let syntheticSearchSchema: object | null = null
    if (toolSearchState && hasUndiscoveredTools(toolSearchState)) {
      syntheticSearchSchema = buildSyntheticToolSearchSchema(toolSearchState)
    }

    const aiSdkTools = anthropicToolsToAISdk(toolSchemas, syntheticSearchSchema)

    // ── 6. Create AI SDK provider ──
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    })

    // Check if thinking/reasoning is enabled
    const thinkingEnabled =
      thinkingConfig != null &&
      typeof thinkingConfig === 'object' &&
      (thinkingConfig as { type?: string }).type !== 'disabled'

    // ── 7. Stream using AI SDK ──
    const result = streamText({
      model: provider.chatModel(config.model),
      system: systemStr,
      messages: aiSdkMessages,
      tools: aiSdkTools as any,
      maxOutputTokens: config.maxTokens,
      temperature: options.temperatureOverride ?? 1,
      abortSignal: signal,
      maxRetries: 0, // We handle retries at a higher level
    })

    // ── 8. Process fullStream and translate to Anthropic events ──
    const requestId = randomUUID()
    const messageId = `msg_openai_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    let ttftMs = 0
    let isFirstChunk = true

    // State for accumulating the response
    let currentBlockIndex = 0
    let hasThinkingBlock = false
    let thinkingBlockIndex = -1
    let hasTextBlock = false
    let textBlockIndex = -1
    const contentBlocks: Record<number, { type: string; [key: string]: unknown }> = {}
    // Track tool call block indices by their AI SDK id
    const toolCallBlocks = new Map<string, number>()
    let usage = { input_tokens: 0, output_tokens: 0 }
    let stopReason: string | null = null

    // Partial message shape for AssistantMessage construction
    const partialMessage = {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: config.model,
      content: [],
      stop_reason: null as string | null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }

    function makeAssistantMessage(
      contentBlock: { type: string; [key: string]: unknown },
    ): AnyAssistantMessage {
      return {
        message: {
          ...partialMessage,
          content: normalizeContentFromAPI(
            [contentBlock] as unknown as BetaContentBlock[],
            tools,
            options.agentId,
          ),
        },
        requestId,
        type: 'assistant',
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
      }
    }

    function streamEvent(event: unknown, extra?: { ttftMs?: number }): AnyStreamEvent {
      return { type: 'stream_event', event, ...extra }
    }

    const messageStartEvent = { type: 'message_start', message: partialMessage }

    for await (const part of result.fullStream) {
      // Emit message_start on first meaningful chunk
      if (isFirstChunk) {
        ttftMs = Date.now() - start
        yield streamEvent(messageStartEvent, { ttftMs })
        isFirstChunk = false
      }

      switch (part.type) {
        // ── Reasoning/thinking ──
        case 'reasoning-start': {
          if (!thinkingEnabled) break
          thinkingBlockIndex = currentBlockIndex++
          hasThinkingBlock = true
          contentBlocks[thinkingBlockIndex] = { type: 'thinking', thinking: '' }

          yield streamEvent({
            type: 'content_block_start',
            index: thinkingBlockIndex,
            content_block: { type: 'thinking', thinking: '' },
          })
          break
        }

        case 'reasoning-delta': {
          if (!thinkingEnabled || !hasThinkingBlock) break
          const thinkingBlock = contentBlocks[thinkingBlockIndex]!
          thinkingBlock.thinking =
            (thinkingBlock.thinking as string) + part.text

          yield streamEvent({
            type: 'content_block_delta',
            index: thinkingBlockIndex,
            delta: { type: 'thinking_delta', thinking: part.text },
          })
          break
        }

        case 'reasoning-end': {
          if (!thinkingEnabled || !hasThinkingBlock) break
          yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
          yield streamEvent({
            type: 'content_block_stop',
            index: thinkingBlockIndex,
          })
          hasThinkingBlock = false
          break
        }

        // ── Text content ──
        case 'text-start': {
          // Close any remaining thinking block before text starts
          if (hasThinkingBlock) {
            yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
            yield streamEvent({
              type: 'content_block_stop',
              index: thinkingBlockIndex,
            })
            hasThinkingBlock = false
          }

          textBlockIndex = currentBlockIndex++
          hasTextBlock = true
          contentBlocks[textBlockIndex] = { type: 'text', text: '' }

          yield streamEvent({
            type: 'content_block_start',
            index: textBlockIndex,
            content_block: { type: 'text', text: '' },
          })
          break
        }

        case 'text-delta': {
          if (!hasTextBlock) {
            // Safety: if we get a delta without start, create the block
            if (hasThinkingBlock) {
              yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
              yield streamEvent({
                type: 'content_block_stop',
                index: thinkingBlockIndex,
              })
              hasThinkingBlock = false
            }
            textBlockIndex = currentBlockIndex++
            hasTextBlock = true
            contentBlocks[textBlockIndex] = { type: 'text', text: '' }
            yield streamEvent({
              type: 'content_block_start',
              index: textBlockIndex,
              content_block: { type: 'text', text: '' },
            })
          }

          const textBlock = contentBlocks[textBlockIndex]!
          textBlock.text = (textBlock.text as string) + part.text

          yield streamEvent({
            type: 'content_block_delta',
            index: textBlockIndex,
            delta: { type: 'text_delta', text: part.text },
          })
          break
        }

        case 'text-end': {
          if (hasTextBlock) {
            yield makeAssistantMessage(contentBlocks[textBlockIndex]!)
            yield streamEvent({
              type: 'content_block_stop',
              index: textBlockIndex,
            })
            hasTextBlock = false
          }
          break
        }

        // ── Tool calls ──
        case 'tool-input-start': {
          // Close thinking block if transitioning directly to tool calls
          if (hasThinkingBlock) {
            yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
            yield streamEvent({ type: 'content_block_stop', index: thinkingBlockIndex })
            hasThinkingBlock = false
          }
          // Close text block if transitioning to tool calls
          if (hasTextBlock) {
            yield makeAssistantMessage(contentBlocks[textBlockIndex]!)
            yield streamEvent({ type: 'content_block_stop', index: textBlockIndex })
            hasTextBlock = false
          }

          const blockIndex = currentBlockIndex++
          toolCallBlocks.set(part.id, blockIndex)
          contentBlocks[blockIndex] = {
            type: 'tool_use',
            id: part.id,
            name: part.toolName,
            input: '',
          }

          yield streamEvent({
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'tool_use',
              id: part.id,
              name: part.toolName,
              input: '',
            },
          })
          break
        }

        case 'tool-input-delta': {
          const blockIdx = toolCallBlocks.get(part.id)
          if (blockIdx !== undefined) {
            const block = contentBlocks[blockIdx]!
            block.input = (block.input as string) + part.delta

            yield streamEvent({
              type: 'content_block_delta',
              index: blockIdx,
              delta: {
                type: 'input_json_delta',
                partial_json: part.delta,
              },
            })
          }
          break
        }

        case 'tool-input-end': {
          const blockIdx = toolCallBlocks.get(part.id)
          if (blockIdx !== undefined) {
            yield makeAssistantMessage(contentBlocks[blockIdx]!)
            yield streamEvent({
              type: 'content_block_stop',
              index: blockIdx,
            })
          }
          break
        }

        // ── Step finish (contains usage and finish reason) ──
        case 'finish-step': {
          if (part.usage) {
            usage = {
              input_tokens: part.usage.inputTokens ?? 0,
              output_tokens: part.usage.outputTokens ?? 0,
            }
          }
          break
        }

        // ── Overall finish ──
        case 'finish': {
          stopReason =
            aiSdkFinishReasonToAnthropic(part.finishReason) ?? 'end_turn'

          if (part.totalUsage) {
            usage = {
              input_tokens: part.totalUsage.inputTokens ?? 0,
              output_tokens: part.totalUsage.outputTokens ?? 0,
            }
          }

          // Close any remaining thinking block
          if (hasThinkingBlock) {
            yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
            yield streamEvent({ type: 'content_block_stop', index: thinkingBlockIndex })
            hasThinkingBlock = false
          }

          // Close any remaining text block
          if (hasTextBlock) {
            yield makeAssistantMessage(contentBlocks[textBlockIndex]!)
            yield streamEvent({ type: 'content_block_stop', index: textBlockIndex })
            hasTextBlock = false
          }

          // message_delta with final usage and stop reason
          yield streamEvent({
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: usage.output_tokens },
          })

          // message_stop
          yield streamEvent({ type: 'message_stop' })
          break
        }

        case 'error': {
          throw part.error
        }

        // Skip other event types (source, file, start, start-step, etc.)
        default:
          break
      }
    }

    // Graceful close if no finish event was received
    if (stopReason === null && !isFirstChunk) {
      if (hasThinkingBlock) {
        yield makeAssistantMessage(contentBlocks[thinkingBlockIndex]!)
        yield streamEvent({ type: 'content_block_stop', index: thinkingBlockIndex })
      }
      if (hasTextBlock) {
        yield makeAssistantMessage(contentBlocks[textBlockIndex]!)
        yield streamEvent({ type: 'content_block_stop', index: textBlockIndex })
      }
      yield streamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: usage.output_tokens },
      })
      yield streamEvent({ type: 'message_stop' })
    }
  } catch (error) {
    if (signal.aborted) {
      return
    }
    // Re-throw so query.ts catch block creates proper AssistantAPIErrorMessage.
    throw error
  }
}
