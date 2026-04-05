/**
 * Adapted stream wrapper for queryModelOpenAIWithStreaming.
 *
 * Same dual-emit pattern as the Anthropic `streamAdapter.ts`:
 * wraps the OpenAI-compatible streaming generator to additionally yield
 * InternalStreamPart events alongside the existing legacy yields.
 *
 * The inner generator (aiSdkAdapter) already translates AI SDK fullStream
 * events into synthesized Anthropic-format stream events.  Because the
 * yielded events are Anthropic-shaped, we use the Anthropic converter
 * for the translation to InternalStreamPart.
 *
 * When the adapter is eventually refactored to yield native AI SDK stream
 * parts (Phase 3+), this file should switch to using
 * `aiSdkStreamPartToInternal` from `../converters/ai-sdk.js` instead.
 */
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { InternalStreamPart } from '../../../types/internal-messages.js'
import { anthropicStreamEventToInternal } from '../converters/anthropic.js'
import { queryModelOpenAIWithStreaming } from './aiSdkAdapter.js'

// ═══════════════════════════════════════════════════════════════════
// Adapted yield type
// ═══════════════════════════════════════════════════════════════════

// The OpenAI adapter uses loose types (AnyStreamEvent / AnyAssistantMessage)
// rather than the strict types from message.ts.  We mirror that here so the
// wrapper is compatible without requiring the exact Anthropic SDK types.

type LegacyYieldValue =
  | { type: 'stream_event'; event: unknown; ttftMs?: number }
  | { type: 'assistant'; [key: string]: unknown }

export type AdaptedOpenAIStreamEvent =
  | { source: 'legacy'; value: LegacyYieldValue }
  | { source: 'internal'; value: InternalStreamPart }

// ═══════════════════════════════════════════════════════════════════
// Wrapper generator
// ═══════════════════════════════════════════════════════════════════

/**
 * Wraps `queryModelOpenAIWithStreaming` to dual-emit both legacy events
 * and their InternalStreamPart equivalents.
 *
 * The conversion logic is identical to the Anthropic wrapper because
 * the OpenAI adapter synthesizes Anthropic-shaped stream events.
 */
export async function* adaptedQueryModelOpenAIWithStreaming(
  params: Parameters<typeof queryModelOpenAIWithStreaming>[0],
): AsyncGenerator<AdaptedOpenAIStreamEvent, void> {
  const blockIndex = { current: 0 }

  for await (const event of queryModelOpenAIWithStreaming(params)) {
    // 1. Always yield the legacy event untouched.
    yield { source: 'legacy' as const, value: event as LegacyYieldValue }

    // 2. If it's a stream event, convert the synthesized Anthropic event.
    if (event.type === 'stream_event') {
      const streamEvent = event as { type: 'stream_event'; event: unknown }
      const internal = anthropicStreamEventToInternal(
        streamEvent.event as BetaRawMessageStreamEvent,
        blockIndex,
      )
      if (internal !== null) {
        yield { source: 'internal' as const, value: internal }
      }
    }
  }
}
