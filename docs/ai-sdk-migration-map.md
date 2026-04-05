# Anthropic SDK to Vercel AI SDK: Internal Type Migration Map

> Generated 2026-04-04. Based on codebase analysis of `/Users/wellington/Projects/free-code`.

---

## 1. Complete Type Mapping Table

### 1.1 Message-Level Types

| Anthropic SDK Type | Import Path | AI SDK Equivalent | Import Path | Notes |
|---|---|---|---|---|
| `MessageParam` (aliased `BetaMessageParam`) | `@anthropic-ai/sdk/resources/beta/messages/messages.mjs` | `ModelMessage` | `@ai-sdk/provider-utils` or `ai` | Union of `SystemModelMessage \| UserModelMessage \| AssistantModelMessage \| ToolModelMessage`. Anthropic has no `tool` role; tool results live inside `user` messages. AI SDK separates them. |
| `BetaMessage` | `@anthropic-ai/sdk/resources/beta/messages/messages.mjs` | `StepResult<TOOLS>` / response messages | `ai` | No single equivalent. The finished message is accessed via `StreamTextResult.response` which yields `ResponseMessage[]` (assistant + tool messages). |
| `BetaRawMessageStreamEvent` | `@anthropic-ai/sdk/resources/beta/messages/messages.mjs` | `TextStreamPart<TOOLS>` | `ai` | Stream events from `streamText().fullStream`. See Section 2 for detailed event mapping. |
| Internal `AssistantMessage` | `src/types/message.js` | Custom (keep, but change `.message.content` shape) | -- | Wraps `BetaMessage` with `uuid`, `timestamp`, `requestId`, etc. The wrapper stays; only the inner `content` format changes. |
| Internal `UserMessage` | `src/types/message.js` | Custom (keep) | -- | Same wrapper pattern. |

### 1.2 Content Block Types

| Anthropic SDK Type | AI SDK Equivalent | Notes |
|---|---|---|
| `TextBlock` / `{ type: 'text', text: string }` | `TextPart` = `{ type: 'text', text: string }` | Identical shape, different type name. |
| `ToolUseBlock` = `{ type: 'tool_use', id, name, input }` | `ToolCallPart` = `{ type: 'tool-call', toolCallId, toolName, input }` | Key renames: `id` -> `toolCallId`, `name` -> `toolName`, `type` uses hyphen. |
| `ToolResultBlockParam` = `{ type: 'tool_result', tool_use_id, content, is_error? }` | `ToolResultPart` = `{ type: 'tool-result', toolCallId, toolName, output: ToolResultOutput }` | Major structural change. See Section 3. |
| `ContentBlockParam` (union of all block types) | `AssistantContent` / `UserContent` / `ToolContent` | AI SDK splits content unions by role. No single union covers all. |
| `BetaContentBlock` (API response block union) | Parts of `AssistantContent` | Used in assistant message content. |
| `{ type: 'thinking', thinking: string }` | `ReasoningPart` = `{ type: 'reasoning', text: string }` | Key rename: `thinking` -> `text`, type: `thinking` -> `reasoning`. |
| `{ type: 'redacted_thinking' }` | No equivalent | AI SDK has no concept of redacted reasoning. Must be handled as provider-specific metadata or dropped. |
| `{ type: 'image', source: { type, media_type, data } }` | `ImagePart` = `{ type: 'image', image: URL \| Uint8Array, mimeType? }` | Different encoding. Anthropic uses base64 in `source.data`; AI SDK uses URL or binary. |
| `{ type: 'document', source: {...} }` | `FilePart` = `{ type: 'file', data: DataContent, mimeType }` | AI SDK uses a generic file part. |
| `ConnectorTextBlock` (custom) | No equivalent | Anthropic-specific. Would need custom handling. |
| `{ type: 'server_tool_use' }` | Provider-executed tool calls (`providerExecuted: true` on `ToolCallPart`) | AI SDK models provider-executed tools as regular tool calls with a flag. |

### 1.3 Tool Definition Types

| Anthropic SDK Type | AI SDK Equivalent | Notes |
|---|---|---|
| `BetaToolUnion` (tool schema for API) | `ToolSet` = `Record<string, Tool>` | AI SDK tools are keyed by name. Each has `{ parameters, description?, execute? }`. |
| `input_schema: { type: 'object', properties }` | `parameters: Schema` (JSON Schema or Zod) | AI SDK accepts `jsonSchema()` wrapper or `zodSchema()`. |
| `cache_control` on tool schema | Not supported | Anthropic-specific prompt caching. Must be handled at provider adapter level. |

### 1.4 API Response Types

| Anthropic SDK Type | AI SDK Equivalent | Notes |
|---|---|---|
| `BetaStopReason` = `'end_turn' \| 'tool_use' \| 'max_tokens' \| 'stop_sequence'` | `FinishReason` = `'stop' \| 'tool-calls' \| 'length' \| 'content-filter' \| 'error' \| 'other'` | Different vocabularies. Mapping: `end_turn`->`stop`, `tool_use`->`tool-calls`, `max_tokens`->`length`. |
| `BetaUsage` = `{ input_tokens, output_tokens, cache_creation_input_tokens, ... }` | `LanguageModelUsage` = `{ inputTokens, outputTokens, inputTokenDetails: { cacheReadTokens, ... } }` | camelCase, nested detail structure. Cache tokens are sub-fields. |

---

## 2. Stream Event Mapping

### Anthropic Stream Events -> AI SDK `fullStream` Parts

| Anthropic `BetaRawMessageStreamEvent.type` | AI SDK `TextStreamPart.type` | Notes |
|---|---|---|
| `message_start` | `start` + `start-step` | AI SDK emits `start` once, then `start-step` per step. |
| `content_block_start` (type=text) | `text-start` | Includes `id` field in AI SDK. |
| `content_block_delta` (type=text_delta) | `text-delta` | `delta.text` -> `text`. |
| `content_block_stop` (text) | `text-end` | |
| `content_block_start` (type=thinking) | `reasoning-start` | |
| `content_block_delta` (type=thinking_delta) | `reasoning-delta` | `delta.thinking` -> `text`. |
| `content_block_stop` (thinking) | `reasoning-end` | |
| `content_block_start` (type=tool_use) | `tool-input-start` | Has `id`, `toolName`. |
| `content_block_delta` (type=input_json_delta) | `tool-input-delta` | `delta.partial_json` -> `delta`. |
| `content_block_stop` (tool_use) | `tool-input-end` | |
| N/A (tool results come from local execution) | `tool-call` (complete) | AI SDK emits a complete `tool-call` part after input streaming ends. |
| N/A | `tool-result` | Only emitted when tools have `execute` functions (auto-execution). |
| `message_delta` | `finish-step` | Contains usage and finish reason. |
| `message_stop` | `finish` | Contains `totalUsage` and `finishReason`. |

### Key Difference: Event Granularity

Anthropic's streaming uses indexed content blocks (`content_block_start` with `index`). AI SDK uses `id`-based tracking. The existing `aiSdkAdapter.ts` already translates AI SDK events back into Anthropic's indexed format (lines 680-920). A migration would **reverse** this: the adapter would no longer need to synthesize Anthropic events.

---

## 3. Tool Protocol Differences

### 3.1 Tool Use ID Linking

**Anthropic pattern:**
```
assistant: [{ type: 'tool_use', id: 'toolu_123', name: 'Bash', input: {...} }]
user:      [{ type: 'tool_result', tool_use_id: 'toolu_123', content: '...', is_error: false }]
```
Tool results are embedded in `user` messages. Multiple tool results can share one user message.

**AI SDK pattern:**
```
assistant: { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call_123', toolName: 'Bash', input: {...} }] }
tool:      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_123', toolName: 'Bash', output: { type: 'text', value: '...' } }] }
```
Tool results go in a separate `tool` role message (not `user`). This is a **structural change** that affects how conversation history is built.

### 3.2 Error Reporting

- **Anthropic**: `is_error: true` on `tool_result` block, error text in `content`.
- **AI SDK**: `ToolResultOutput` has explicit error types: `{ type: 'error-text', value: string }` or `{ type: 'execution-denied', reason? }`.

### 3.3 Mixed Content in User Messages

Anthropic allows user messages to contain both `tool_result` blocks and `text`/`image` blocks in a single message. AI SDK separates these: text/images go in `UserModelMessage`, tool results go in `ToolModelMessage`. The existing adapter (`aiSdkAdapter.ts:205-297`) already handles this split.

### 3.4 Patterns Used in Codebase

From `src/query.ts` and `src/services/tools/toolExecution.ts`:

1. **Tool loop pattern** (query.ts:123-148): Assistant emits `tool_use` blocks -> extract them -> execute each -> create user messages with `tool_result` blocks -> feed back to API. The AI SDK equivalent: extract `tool-call` parts -> execute -> create `tool` messages with `tool-result` parts.

2. **tool_use_id linking** (62 occurrences across 20 files): Code creates `{ type: 'tool_result', tool_use_id: toolUse.id }`. Must change to `{ type: 'tool-result', toolCallId: toolCall.toolCallId }`.

3. **Inline tool results** (toolExecution.ts:1031-1038): `ContentBlockParam[]` arrays mix `tool_result` with `image` blocks at the same level. AI SDK would require splitting these across message types.

4. **Missing tool result injection** (query.ts:123-148): `yieldMissingToolResultBlocks()` creates error results for interrupted tool calls. Same pattern, different type names.

### 3.5 Can AI SDK Handle All Patterns?

| Pattern | Supported? | Notes |
|---|---|---|
| Basic tool call/result loop | Yes | Core feature of AI SDK. |
| Multiple tool calls per turn | Yes | `AssistantContent` is an array of parts. |
| Streaming tool input | Yes | `tool-input-start/delta/end` events. |
| `is_error` on tool results | Yes | `ToolResultOutput` has `error-text` type. |
| Images alongside tool results | Partial | Must be in separate user message, not inline with tool results. |
| `cache_control` on messages | No | Provider-specific, use `providerOptions`. |
| `thinking` / `redacted_thinking` | Partial | `reasoning` supported; `redacted_thinking` is not. |
| `connector_text` blocks | No | Custom Anthropic type, needs provider-specific handling. |
| `server_tool_use` (web search) | Yes | Via `providerExecuted: true` flag. |
| Prompt caching breakpoints | No | Anthropic-specific, handle at adapter level. |

---

## 4. Internal Format Proposal

### 4.1 Design Principles

1. **Provider-neutral**: No Anthropic or OpenAI types in the internal representation.
2. **Superset**: Must represent everything any supported provider can produce/consume.
3. **Wrapper-compatible**: The existing `AssistantMessage` / `UserMessage` wrappers (with `uuid`, `timestamp`, `requestId`) survive; only the inner `message.content` changes.
4. **Aligned with AI SDK**: Since AI SDK is the target multi-provider abstraction, align with its vocabulary where possible.

### 4.2 Proposed Types

```typescript
// ============================================================
// src/types/internal-messages.ts  (new file)
// ============================================================

// --- Parts (content blocks) ---

export interface InternalTextPart {
  type: 'text'
  text: string
}

export interface InternalReasoningPart {
  type: 'reasoning'
  text: string
  /** Provider-specific: Anthropic redacted_thinking, etc. */
  redacted?: boolean
  /** Opaque provider data for round-tripping redacted blocks */
  providerData?: unknown
}

export interface InternalToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: unknown  // JSON-serializable
  /** True if tool was executed server-side (e.g., Anthropic web_search) */
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

export interface InternalImagePart {
  type: 'image'
  /** base64 data URL or raw URL */
  data: string
  mimeType: string
}

export interface InternalFilePart {
  type: 'file'
  data: string | Uint8Array
  mimeType: string
  filename?: string
}

export type InternalAssistantPart =
  | InternalTextPart
  | InternalReasoningPart
  | InternalToolCallPart

export type InternalUserPart =
  | InternalTextPart
  | InternalImagePart
  | InternalFilePart

export type InternalToolPart =
  | InternalToolResultPart

// --- Messages ---

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

export interface InternalToolMessage {
  role: 'tool'
  content: InternalToolPart[]
}

export type InternalMessage =
  | InternalSystemMessage
  | InternalUserMessage
  | InternalAssistantMessage
  | InternalToolMessage

// --- Streaming Events ---

export type InternalStreamPart =
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'step-finish'; usage: InternalUsage; finishReason: InternalFinishReason }
  | { type: 'finish'; totalUsage: InternalUsage; finishReason: InternalFinishReason }
  | { type: 'error'; error: unknown }

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
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

### 4.3 Converter Functions Needed

```typescript
// src/services/api/converters/anthropic.ts
export function anthropicMessageToInternal(msg: MessageParam): InternalMessage
export function internalToAnthropicMessage(msg: InternalMessage): MessageParam
export function anthropicContentBlockToInternalPart(block: BetaContentBlock): InternalAssistantPart
export function anthropicStreamEventToInternalPart(event: BetaRawMessageStreamEvent): InternalStreamPart | null

// src/services/api/converters/ai-sdk.ts
export function aiSdkMessageToInternal(msg: ModelMessage): InternalMessage
export function internalToAiSdkMessage(msg: InternalMessage): ModelMessage
export function internalStreamPartToAiSdk(part: InternalStreamPart): TextStreamPart | null
```

### 4.4 Key Design Decision: `tool` Role Separation

The most impactful change is moving from Anthropic's "tool results inside user messages" to a dedicated `tool` role. This affects:

- `createUserMessage()` calls that include `tool_result` content
- The query loop's message construction
- All normalization and serialization code

**Recommendation**: Adopt the 4-role model (`system`, `user`, `assistant`, `tool`) internally, matching AI SDK. Convert to Anthropic's 3-role model (`system`, `user`, `assistant` with tool_results in user) only at the Anthropic adapter boundary.

---

## 5. File Impact Analysis

### 5.1 Summary Counts

| Category | Files | Occurrences |
|---|---|---|
| Files importing from `@anthropic-ai/sdk` | 124 | ~527 |
| Files referencing `ToolUseBlock` | 25 | 75 |
| Files referencing `ToolResultBlockParam` | 30+ | 74 |
| Files referencing `ContentBlockParam` / `BetaContentBlock` | 30+ | 139 |
| Files referencing `MessageParam` | 10 | 40 |
| Files referencing `BetaMessage` / `BetaRawMessageStreamEvent` | 10 | 36 |
| Files referencing `tool_use_id` | 20 | 62 |
| Type-only imports (trivial to change) | 8 | -- |
| Value imports (need logic changes) | 116 | -- |

### 5.2 Tier 1: Core API Layer (Change First) -- ~15 files

These files directly construct/parse API messages and must change to use the internal format.

| File | Anthropic Types Used | Effort |
|---|---|---|
| `src/services/api/claude.ts` | `BetaMessage`, `BetaRawMessageStreamEvent`, `MessageParam`, `BetaToolUnion`, `BetaStopReason` | **High** -- Main Anthropic API interface. ~6 type refs, complex streaming logic. |
| `src/services/api/streamHandler.ts` | `BetaRawMessageStreamEvent`, `BetaUsage` | **High** -- Stream event processing, usage tracking. |
| `src/services/api/messageConversion.ts` | `MessageParam`, `BetaContentBlockParam`, `BetaToolResultBlockParam` | **High** -- Converts internal messages to API format. Core of the adapter. |
| `src/services/api/errorHandler.ts` | `BetaMessage`, `BetaRawMessageStreamEvent` | **Medium** -- Error extraction from API responses. |
| `src/services/api/errors.ts` | `BetaMessage`, `tool_use_id` | **Medium** -- Error message construction. |
| `src/services/api/params.ts` | `BetaToolUnion`, `BetaMessageParam` | **Medium** -- API parameter construction. |
| `src/services/api/openai/aiSdkAdapter.ts` | `BetaContentBlock`, `BetaToolUnion`, `BetaContentBlockParam` | **High** -- Already bridges AI SDK <-> Anthropic. Would become simpler. |
| `src/services/api/logging.ts` | `BetaUsage` | **Low** -- Usage logging. |
| `src/services/api/promptCacheBreakDetection.ts` | `MessageParam` | **Low** |
| `src/services/api/dumpPrompts.ts` | Anthropic types | **Low** |
| `src/services/tokenEstimation.ts` | `BetaMessage`, `MessageParam`, `ToolUseBlock`, `ContentBlockParam` | **High** -- Token counting logic, many type refs. |

### 5.3 Tier 2: Message Construction & Tool Execution -- ~15 files

These files create and inspect message content blocks.

| File | Anthropic Types Used | Effort |
|---|---|---|
| `src/utils/messages/create.ts` | `BetaContentBlock`, `ContentBlockParam`, `ToolResultBlockParam`, `BetaUsage` | **High** -- All message factory functions. |
| `src/utils/messages/types.ts` | `ToolUseBlock`, `ToolResultBlockParam` | **Medium** -- Type predicates (isToolUseRequestMessage, etc.). |
| `src/utils/messages/stream.ts` | `BetaToolUseBlock` | **Medium** -- StreamingToolUse type. |
| `src/utils/messages/lookups.ts` | `ToolUseBlock` | **Medium** -- Message lookup helpers. |
| `src/services/tools/toolExecution.ts` | `ToolUseBlock`, `ToolResultBlockParam`, `ContentBlockParam` | **High** -- Builds tool_result blocks, 15+ refs. 6 `tool_use_id` refs. |
| `src/services/tools/toolOrchestration.ts` | `ToolUseBlock` | **Medium** -- Tool dispatch, 6 refs. |
| `src/services/tools/StreamingToolExecutor.ts` | `ToolUseBlock` | **Medium** -- Streaming tool execution, 3 refs. |
| `src/query.ts` | `ToolUseBlock`, `ToolResultBlockParam` | **High** -- Main query loop, tool result creation. |
| `src/utils/toolResultStorage.ts` | `ToolResultBlockParam` | **High** -- 16 refs, tool result persistence. |
| `src/Tool.ts` | `ToolResultBlockParam`, `ToolUseBlockParam` | **Medium** -- Tool interface definition, 6 refs. |

### 5.4 Tier 3: UI Components & Rendering -- ~25 files

These inspect message content for display. They read `.type === 'tool_use'` etc. but don't construct API payloads.

| Category | Files | Effort Each |
|---|---|---|
| `src/components/messages/*.tsx` (AssistantToolUseMessage, GroupedToolUseContent, UserToolResult*, etc.) | ~8 | **Low** -- Change `.type === 'tool_use'` to `.type === 'tool-call'`, rename fields. |
| `src/components/Message.tsx`, `MessageSelector.tsx`, `FallbackToolUseErrorMessage.tsx` | 3 | **Low** |
| `src/components/permissions/PermissionRequest.tsx` | 1 | **Low** |
| `src/tools/*/UI.tsx` (BashTool, FileEditTool, GrepTool, GlobTool, etc.) | ~12 | **Low** -- Display components that read tool input/output. |

### 5.5 Tier 4: Supporting Utilities -- ~30 files

| Category | Files | Effort Each |
|---|---|---|
| `src/utils/permissions/*` (yoloClassifier, classifierShared) | 2-3 | **Low-Medium** |
| `src/utils/groupToolUses.ts`, `contextAnalysis.ts`, `analyzeContext.ts` | 3 | **Low** |
| `src/hooks/toolPermission/*` | 3 | **Low** |
| `src/bridge/*` (inboundMessages, inboundAttachments) | 2 | **Medium** -- External SDK interface. |
| `src/commands/*` (review, statusline) | 3-4 | **Low** |
| `src/services/compact/*` (microCompact) | 2 | **Medium** -- Compaction logic touches content blocks. |
| `src/services/mcp/client.ts` | 1 | **Medium** -- MCP protocol translation. |
| `src/utils/processUserInput/*` | 4 | **Medium** -- Input processing pipeline. |
| `src/utils/swarm/*`, `src/utils/ultraplan/*` | 2-3 | **Medium** |
| `src/skills/bundledSkills.ts` | 1 | **Low** |
| `src/tasks/RemoteAgentTask/*` | 1 | **Medium** |
| Remaining files (20+) | 20+ | **Low** -- Type-only or shallow usage. |

### 5.6 Tier 5: Files That Become Simpler -- ~2 files

| File | Why |
|---|---|
| `src/services/api/openai/aiSdkAdapter.ts` | Currently does Anthropic -> AI SDK -> synthesize-back-to-Anthropic events. With internal format aligned to AI SDK, the back-conversion is eliminated. This 946-line file would shrink to ~200 lines. |

---

## 6. Migration Strategy

### Phase 0: Foundation (1-2 days)

1. **Create internal type definitions** (`src/types/internal-messages.ts`) as specified in Section 4.2.
2. **Create converter modules**:
   - `src/services/api/converters/anthropic.ts` -- bidirectional conversion between internal format and Anthropic API types.
   - `src/services/api/converters/ai-sdk.ts` -- bidirectional conversion between internal format and AI SDK types.
3. **Do not change any existing code yet.** Just add the new types and converters alongside.

### Phase 1: API Boundary (3-5 days)

4. **Wrap `queryModelWithStreaming`** (in `claude.ts`) to yield `InternalStreamPart` instead of `BetaRawMessageStreamEvent`. The wrapper calls the Anthropic converter on each event.
5. **Wrap `queryModelOpenAIWithStreaming`** (in `aiSdkAdapter.ts`) to yield the same `InternalStreamPart`. Since AI SDK events already match the internal format, this is mostly type renaming.
6. **Update `query.ts`** to consume `InternalStreamPart` instead of Anthropic stream events. This is the critical integration point.
7. **Update message creation** in `utils/messages/create.ts` to produce messages with internal content parts instead of `BetaContentBlock`.

### Phase 2: Tool Execution Layer (2-3 days)

8. **Update `ToolUseBlock` references** in `toolOrchestration.ts`, `StreamingToolExecutor.ts`, and `toolExecution.ts` to use `InternalToolCallPart`.
9. **Update tool result construction** from `{ type: 'tool_result', tool_use_id, content, is_error }` to `InternalToolResultPart`.
10. **Update `Tool.ts`** interface -- the `ToolResult<T>` type stays, but the `ToolResultBlockParam` import is removed. Tool result -> message conversion uses internal types.

### Phase 3: Message Utilities (2-3 days)

11. **Update `utils/messages/types.ts`** predicates (`isToolUseRequestMessage`, `isToolUseResultMessage`) to check for `'tool-call'` and `'tool-result'` types.
12. **Update `utils/messages/stream.ts`** -- `StreamingToolUse` type changes from `BetaToolUseBlock` to `InternalToolCallPart`.
13. **Update `utils/messages/lookups.ts`** and all other message utility modules.
14. **Update `toolResultStorage.ts`** (16 refs) to use internal types.

### Phase 4: UI Layer (1-2 days)

15. **Bulk rename** in UI components: `'tool_use'` -> `'tool-call'`, `'tool_result'` -> `'tool-result'`, `.id` -> `.toolCallId`, `.name` -> `.toolName`.
16. **Update `tools/*/UI.tsx`** files (12 files) -- these render tool-specific output and reference block types.

### Phase 5: Supporting Systems (2-3 days)

17. **Update bridge, remote, and SDK adapter** modules that serialize/deserialize messages.
18. **Update compact/microCompact** -- content block inspection during compaction.
19. **Update permissions classifiers** that inspect tool call content.
20. **Update MCP client** message translation.

### Phase 6: Cleanup (1 day)

21. **Remove all direct `@anthropic-ai/sdk` type imports** outside of `src/services/api/converters/anthropic.ts` and `src/services/api/claude.ts`.
22. **Simplify `aiSdkAdapter.ts`** -- remove the Anthropic event synthesis layer.
23. **Run full test suite**, fix any remaining type errors.

**Estimated total: 12-19 developer-days** for the full migration.

---

## 7. Risk Assessment

### 7.1 High Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **Tool result role separation** (`user` -> `tool`) | Breaks the entire tool loop if not done atomically. Every tool result creation site must change. | Phase 1-2 must be done together. Use the converter at the Anthropic boundary to re-merge tool results into user messages for the Anthropic API. |
| **Streaming event translation fidelity** | Lost or malformed events cause UI corruption, incomplete tool calls, or broken compaction. | The existing `aiSdkAdapter.ts` is a working reference implementation (946 lines) showing exactly what mapping looks like. Use it as a test oracle. |
| **`tool_use_id` format change** | 62 occurrences across 20 files reference `tool_use_id`. Any missed rename silently breaks tool result matching. | Automated codemod: `s/tool_use_id/toolCallId/g` with manual review. The field name change is mechanical. |
| **Build-time type generation** | `types/message.js` is generated at build time. If the generated types still reference Anthropic SDK types, the migration is incomplete. | Investigate the build pipeline to understand what generates this file. May need to change the generator. |

### 7.2 Medium Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **`redacted_thinking` loss** | AI SDK has no equivalent. If dropped, Anthropic API will reject messages that reference them. | Keep as provider-specific data in `InternalReasoningPart.providerData`. Round-trip through the Anthropic converter. |
| **Image block placement** | Anthropic allows images alongside tool_results in one user message. AI SDK requires them in separate messages. | Handle at converter boundary. Split mixed user messages during Anthropic -> Internal conversion. |
| **Cache control / prompt caching** | Essential for performance with Anthropic API. No AI SDK equivalent. | Handle entirely in the Anthropic converter. Add `providerOptions` to internal messages for cache hints. |
| **`ConnectorTextBlock`** (custom type) | Used internally, no AI SDK equivalent. | Define as an internal-only part type. Strip before sending to non-Anthropic providers. |
| **Compaction logic** | Compact/microCompact inspects content blocks to decide what to summarize. | These operate on internal messages after the migration, so they use internal types. Lower risk since they don't hit the API directly. |

### 7.3 Low Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **UI component updates** | Wrong type string causes silent render failures (component returns null). | TypeScript compiler will catch most mismatches. Manual testing of tool call rendering. |
| **Serialized sessions** | Existing saved sessions use Anthropic format. Loading old sessions post-migration would break. | Add a session format version. Write a migration function that converts old session content blocks to internal format on load. |
| **Third-party SDK consumers** | `@anthropic-ai/claude-agent-sdk` consumers expect Anthropic-shaped events. | The SDK bridge (`src/bridge/*`) already serializes events. Update the bridge to convert internal -> Anthropic format for external consumers. |

---

## 8. Appendix: Existing Adapter as Reference

The file `src/services/api/openai/aiSdkAdapter.ts` (946 lines) is an invaluable reference. It already implements:

- **Anthropic message -> AI SDK message conversion** (`anthropicMessagesToAISdk`, lines 189-358)
- **Anthropic tool schema -> AI SDK tool format** (`anthropicToolsToAISdk`, lines 368-407)
- **AI SDK stream -> synthesized Anthropic events** (lines 679-920)
- **Finish reason mapping** (`aiSdkFinishReasonToAnthropic`, lines 491-506)
- **System prompt conversion** (`systemPromptToString`, lines 168-182)

This file proves the mapping works end-to-end. The migration is essentially about making this conversion the standard path rather than an adapter bolt-on, and doing it with proper typed internal representations instead of casting through `unknown`.
