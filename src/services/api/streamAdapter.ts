/**
 * Adapted stream wrapper for queryModelWithStreaming.
 *
 * Wraps the Anthropic streaming generator to additionally yield
 * InternalStreamPart events alongside the existing StreamEvent /
 * AssistantMessage / SystemAPIErrorMessage yields.
 *
 * This enables incremental migration: existing consumers continue to
 * read the `source: 'legacy'` values unchanged, while new consumers
 * can read `source: 'internal'` InternalStreamPart values.
 *
 * The wrapper is intentionally thin — it is a translation layer, not a
 * rewrite.  The inner generator (queryModelWithStreaming) is called
 * unmodified.
 */
import type {
  AssistantMessage,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { InternalStreamPart } from '../../types/internal-messages.js'
import { anthropicStreamEventToInternal } from './converters/anthropic.js'
import { queryModelWithStreaming } from './claude.js'

// ═══════════════════════════════════════════════════════════════════
// Adapted yield type
// ═══════════════════════════════════════════════════════════════════

export type AdaptedStreamEvent =
  | { source: 'legacy'; value: StreamEvent | AssistantMessage | SystemAPIErrorMessage }
  | { source: 'internal'; value: InternalStreamPart }

// ═══════════════════════════════════════════════════════════════════
// Wrapper generator
// ═══════════════════════════════════════════════════════════════════

/**
 * Wraps `queryModelWithStreaming` to dual-emit both legacy events and
 * their InternalStreamPart equivalents.
 *
 * For each value yielded by the inner generator:
 *   1. Yield `{ source: 'legacy', value }` — the original value.
 *   2. If the value is a `StreamEvent`, convert the inner
 *      `BetaRawMessageStreamEvent` to an `InternalStreamPart` via
 *      the Anthropic converter and yield `{ source: 'internal', value }`.
 *
 * `AssistantMessage` and `SystemAPIErrorMessage` values are only emitted
 * on the legacy channel — they represent high-level aggregates that have
 * no direct streaming-part equivalent.
 */
export async function* adaptedQueryModelWithStreaming(
  params: Parameters<typeof queryModelWithStreaming>[0],
): AsyncGenerator<AdaptedStreamEvent, void> {
  // Monotonically increasing block index tracker shared across the
  // lifetime of this streaming response.  The Anthropic converter uses
  // this to assign sequential IDs to content blocks.
  const blockIndex = { current: 0 }

  for await (const event of queryModelWithStreaming(params)) {
    // 1. Always yield the legacy event untouched.
    yield { source: 'legacy' as const, value: event }

    // 2. If it's a stream event, convert and dual-emit.
    if (event.type === 'stream_event') {
      const internal = anthropicStreamEventToInternal(
        event.event,
        blockIndex,
      )
      if (internal !== null) {
        yield { source: 'internal' as const, value: internal }
      }
    }
    // AssistantMessage (type === 'assistant') and SystemAPIErrorMessage
    // (type === 'system', subtype === 'api_error') have no streaming-part
    // equivalent — they are yielded only on the legacy channel.
  }
}
