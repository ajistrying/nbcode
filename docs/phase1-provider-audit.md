# Phase 1: Provider Abstraction Audit — Vercel AI SDK Migration

**Date:** 2026-04-04
**Scope:** Read-only audit of all provider/streaming/tool-calling surfaces in the codebase.

---

## Summary Table

| File | Anthropic SDK Direct Use | Streaming Events Handled | Tool Protocol | Provider-Specific | Would Change with AI SDK |
|---|---|---|---|---|---|
| `src/services/api/claude.ts` | Heavy — `anthropic.beta.messages.create`, raw stream, types | All 6 events | tool_use, server_tool_use, input accumulation, content normalization | Bedrock betas, Foundry headers, Vertex web search | Core rewrite — `streamText()` replaces ~1500 lines |
| `src/services/api/client.ts` | Heavy — `new Anthropic()`, `AnthropicBedrock`, `AnthropicVertex`, `AnthropicFoundry` | None | None | All 4 providers instantiated here | Replaced by AI SDK provider factory |
| `src/services/api/openai/queryOpenAI.ts` | Types only (synthesizes Anthropic events) | Custom SSE parser, synthesizes all 6 Anthropic events | tool_calls -> tool_use translation, tool_result generation | OpenAI-compatible (vLLM, TGI, etc.) | Replaced entirely by `@ai-sdk/openai` |
| `src/services/api/openai/messageTranslation.ts` | Types only (conversion layer) | None | Anthropic tool_use <-> OpenAI function_calling bidirectional | OpenAI format mapping | Deleted — AI SDK handles this |
| `src/services/api/openai/types.ts` | None | OpenAI SSE chunk types | OpenAI tool_call types | OpenAI-specific | Deleted |
| `src/services/api/openai/config.ts` | None | None | None | OpenAI env var config | Replaced by AI SDK provider config |
| `src/services/api/openai/modelRegistry.ts` | None | None | None | Tier1 model capabilities | Kept as-is or adapted |
| `src/services/api/openai/clientToolSearch.ts` | None | None | Client-side tool search for OpenAI | OpenAI-specific workaround | Possibly kept, possibly merged |
| `src/query.ts` | Types — `ToolUseBlock`, `ToolResultBlockParam` | Consumes `StreamEvent` from claude.ts | `tool_use` block detection drives tool loop, `tool_result` construction | Provider-agnostic (dispatched via deps) | Minimal changes — already provider-neutral via deps |
| `src/query/deps.ts` | None (imports claude.ts indirectly) | None | None | Dispatches to openai vs claude | Simplified — AI SDK normalizes both |
| `src/QueryEngine.ts` | Type: `ContentBlockParam` | None directly (delegates to query.ts) | None directly | None | Minimal changes |
| `src/services/tools/StreamingToolExecutor.ts` | Type: `ToolUseBlock` | None (receives already-parsed blocks) | `tool_result` construction, tool_use_id tracking | None | Minimal changes (ToolUseBlock type) |
| `src/utils/model/providers.ts` | None | None | None | Provider detection (env vars) | Kept — AI SDK still needs provider selection |
| `src/utils/model/bedrock.ts` | None (AWS SDK) | None | None | Bedrock inference profiles, ARN parsing | Kept — Bedrock-specific infra |
| `src/utils/model/model.ts` | None | None | None | Model aliases, 1P vs 3P defaults | Kept — model resolution is provider-agnostic |
| `src/utils/betas.ts` | None directly | None | None | Beta header management per provider | **Major blocker** — no AI SDK equivalent |
| `src/utils/thinking.ts` | None | None | None | Thinking support per model/provider | Kept — AI SDK has thinking support |
| `src/utils/effort.ts` | None | None | None | Effort level per model | **Risk** — AI SDK may not support effort param |
| `src/services/api/errorUtils.ts` | Type: `APIError` | None | None | Error shape from Anthropic SDK | Adapter needed for AI SDK errors |
| `src/services/api/withRetry.ts` | Types: `Anthropic`, `APIError`, `APIConnectionError`, `APIUserAbortError` | None | None | Retry logic tied to Anthropic error types | Adapter or rewrite for AI SDK error types |
| `src/services/tokenEstimation.ts` | `anthropic.beta.messages.countTokens`, `anthropic.beta.messages.create` | None | None | Token counting API | **Blocker** — no AI SDK equivalent for countTokens |
| `src/services/claudeAiLimits.ts` | `anthropic.beta.messages` (rate limit probing) | None | None | 1P rate limit detection | **Blocker** — Anthropic-specific quota API |

---

## Detailed Per-File Findings

### `src/services/api/claude.ts` (~3000 lines) — THE CORE

**Anthropic-specific APIs used:**
- `anthropic.beta.messages.create({...})` — non-streaming (verify, fallback) at lines 570, 879
- `anthropic.beta.messages.create({...stream: true}).withResponse()` — streaming at line 1837
- Types: `BetaMessage`, `BetaRawMessageStreamEvent`, `BetaMessageStreamParams`, `BetaContentBlock`, `BetaToolUnion`, `BetaToolChoiceAuto`, `BetaToolChoiceTool`, `BetaOutputConfig`, `BetaStopReason`, `BetaUsage`, `BetaMessageDeltaUsage`, `BetaJSONOutputFormat`, `Stream`, `MessageParam`
- Error types: `APIError`, `APIUserAbortError`, `APIConnectionTimeoutError`

**Streaming events handled (lines 1994-2320):**
1. `message_start` — captures `partialMessage`, `usage`, `ttftMs`, `research` (ant-only)
2. `content_block_start` — handles `tool_use`, `server_tool_use`, `text`, `thinking`, `redacted_thinking`, `advisor_tool_result`, `connector_text`
3. `content_block_delta` — handles `input_json_delta` (tool input accumulation), `text_delta`, `thinking_delta`, `signature_delta`, `citations_delta`, `connector_text_delta`
4. `content_block_stop` — creates `AssistantMessage` from accumulated content block, yields it
5. `message_delta` — updates `usage`, `stop_reason`, cost calculation, handles `max_tokens` and `model_context_window_exceeded` stop reasons
6. `message_stop` — no-op (loop termination)

**Tool protocol implemented:**
- `tool_use` blocks: accumulated via `input_json_delta` partial JSON, stored in `contentBlocks[]`
- `server_tool_use` blocks: same accumulation pattern (advisor tool)
- Tool schemas built via `toolToAPISchema()` with `defer_loading` for tool search
- `tool_choice` parameter (auto/tool) passed through
- `toolChoice` typing: `BetaToolChoiceTool | BetaToolChoiceAuto`

**Anthropic-specific features with no AI SDK equivalent:**
- `betas` array parameter (18+ distinct beta headers)
- `cache_control` with `type: 'ephemeral'`, `ttl: '1h'`, `scope: 'global'`
- `context_management` parameter (thinking preservation, tool clearing)
- `output_config.effort` (low/medium/high/max)
- `output_config.task_budget` (API-side token budget)
- `output_config.format` (structured outputs via beta)
- `thinking` parameter with `type: 'adaptive'` vs `type: 'enabled'` + `budget_tokens`
- `speed: 'fast'` (fast mode)
- `metadata.user_id` with device/session/account UUIDs
- Non-streaming fallback with `executeNonStreamingRequest` on stream failure
- Stream idle watchdog with configurable timeout
- Connector text blocks (anti-distillation)
- Advisor tool (server-side tool)
- `research` field on messages (ant-only)
- Prompt cache break detection via response token analysis
- `cache_edits` for cached microcompact
- `anti_distillation` extra body param
- `anthropic_internal.effort_override` for numeric effort

**What would change with AI SDK:**
- The entire `queryModel()` generator (~1300 lines) would be replaced by `streamText()` or a thin wrapper
- `paramsFromContext()` parameter building (~200 lines) would need an adapter to map to AI SDK provider options
- Stream event processing switch statement (~350 lines) would be replaced by AI SDK's `onChunk`/`textStream`/`toolCallStream` callbacks
- `updateUsage()` and `accumulateUsage()` would need adapters for AI SDK's usage format
- `cleanupStream()` replaced by AI SDK's built-in resource management
- Non-streaming fallback logic would need to be reimplemented
- Cache breakpoint insertion (`addCacheBreakpoints`) has no AI SDK equivalent

---

### `src/services/api/client.ts` (~390 lines) — CLIENT FACTORY

**Anthropic-specific APIs used:**
- `new Anthropic(config)` — first-party client
- `new AnthropicBedrock(config)` — Bedrock client (dynamic import `@anthropic-ai/bedrock-sdk`)
- `new AnthropicFoundry(config)` — Foundry client (dynamic import `@anthropic-ai/foundry-sdk`)
- `new AnthropicVertex(config)` — Vertex client (dynamic import `@anthropic-ai/vertex-sdk`)

**Provider-specific code:**
- Bedrock: AWS credentials refresh, region override for haiku, bearer token auth, `skipAuth`
- Foundry: Azure AD token provider via `@azure/identity`, API key fallback
- Vertex: Google Auth library integration, project ID discovery, region per model, GCP credentials refresh
- First-party: API key vs OAuth token, staging URL override

**What would change with AI SDK:**
- Entire file replaced by AI SDK provider instantiation:
  - `createAnthropic()` for first-party
  - `createAmazonBedrock()` for Bedrock
  - `createGoogleVertexAI()` for Vertex (AI SDK doesn't have Anthropic-on-Vertex; needs custom provider)
  - Custom provider for Foundry
- Auth flows (OAuth refresh, AWS creds, GCP auth) would move to AI SDK provider config
- Custom headers, proxy config, and `fetch` override would use AI SDK's provider options

**Risks:**
- AI SDK's `@ai-sdk/amazon-bedrock` provider uses the Bedrock Converse API, not the Anthropic SDK. This means beta headers, thinking, effort, and other Anthropic-specific parameters are NOT supported through the standard AI SDK Bedrock provider.
- AI SDK has no Foundry provider — would need a custom provider.
- Vertex via AI SDK uses Google's Gemini models, not Anthropic models on Vertex — would need `@ai-sdk/anthropic` with Vertex configuration or a custom adapter.

---

### `src/services/api/openai/queryOpenAI.ts` (~560 lines) — OpenAI ADAPTER

**Anthropic-specific APIs used:**
- Types only: `BetaContentBlock`, `BetaToolUnion` for schema building
- Synthesizes Anthropic streaming events (`message_start`, `content_block_start`, etc.) from OpenAI SSE chunks

**Streaming handled:**
- Custom `parseSSEStream()` — manual `ReadableStream` -> SSE line parser
- Handles OpenAI delta fields: `delta.content`, `delta.reasoning`, `delta.reasoning_content`, `delta.tool_calls`
- Maps `finish_reason` (stop/tool_calls/length) to Anthropic `stop_reason`

**Tool protocol:**
- Converts Anthropic tool schemas to OpenAI function format via `anthropicToolsToOpenAI()`
- Tracks active tool calls by index, accumulates JSON arguments
- Client-side tool search via `clientToolSearch.ts`

**What would change with AI SDK:**
- Entire file deleted — `@ai-sdk/openai` or `@ai-sdk/openai-compatible` handles this natively
- SSE parsing, tool call accumulation, thinking token handling all replaced
- Observation masking (`maskOldObservations`) might need to be kept as a preprocessing step

---

### `src/services/api/openai/messageTranslation.ts` (~357 lines) — FORMAT BRIDGE

**Purpose:** Bidirectional Anthropic <-> OpenAI message/tool conversion.

**Key functions:**
- `anthropicMessagesToOpenAI()` — converts MessageParam[] to OpenAIChatMessage[]
- `anthropicToolsToOpenAI()` — converts BetaToolUnion[] to OpenAI function schema
- `systemPromptToOpenAI()` — system prompt block conversion
- `openaiFinishReasonToAnthropic()` — stop reason mapping
- `maskOldObservations()` — context window management for open models

**What would change with AI SDK:**
- Entire file deleted — AI SDK normalizes message formats internally
- `maskOldObservations()` might be preserved as a utility if needed

---

### `src/query.ts` (~900+ lines) — QUERY LOOP ORCHESTRATION

**Anthropic-specific APIs used:**
- Types: `ToolUseBlock`, `ToolResultBlockParam` from `@anthropic-ai/sdk/resources/index.mjs`
- Consumes `StreamEvent` (which wraps `BetaRawMessageStreamEvent`)

**Tool protocol:**
- Detects `tool_use` blocks in assistant messages to trigger tool execution
- Constructs `tool_result` blocks in user messages via `createUserMessage`
- `yieldMissingToolResultBlocks()` — generates error tool_results for orphaned tool_uses
- `StreamingToolExecutor` — starts tool execution as tool_use blocks stream in

**What would change with AI SDK:**
- Already provider-neutral via `deps.callModel` — the dispatch is in `deps.ts`
- `ToolUseBlock` and `ToolResultBlockParam` types would change to AI SDK equivalents
- `StreamEvent` type consumed from the model generator would change
- Tool result construction pattern stays the same conceptually

---

### `src/query/deps.ts` (~49 lines) — DEPENDENCY INJECTION

**Provider-specific code:**
- `productionDeps()` checks `getAPIProvider() === 'openai_compatible'` to swap `callModel` implementation
- Routes to `queryModelOpenAIWithStreaming` for OpenAI or `queryModelWithStreaming` for Anthropic

**What would change with AI SDK:**
- Simplified — single `callModel` using AI SDK's `streamText()` with the appropriate provider
- No more runtime provider check for model dispatch

---

### `src/services/tools/StreamingToolExecutor.ts` (~530 lines) — PARALLEL TOOL EXECUTION

**Anthropic-specific APIs used:**
- Type: `ToolUseBlock` from `@anthropic-ai/sdk/resources/index.mjs`

**Tool protocol:**
- Receives `ToolUseBlock` objects, executes tools in parallel with concurrency control
- Produces `tool_result` blocks wrapped in `createUserMessage`
- Handles abort signals, sibling error cancellation, streaming fallback discard

**What would change with AI SDK:**
- `ToolUseBlock` type → AI SDK's `ToolCall` type
- Core logic (concurrency, abort handling, result buffering) stays identical
- Minimal type-level changes only

---

### `src/utils/betas.ts` (~438 lines) — BETA HEADER MANAGEMENT

**Anthropic-specific:**
- Manages 18+ beta headers: `claude-code-20250219`, `interleaved-thinking-*`, `context-1m-*`, `context-management-*`, `structured-outputs-*`, `web-search-*`, `tool-search-tool-*`, `effort-*`, `task-budgets-*`, `prompt-caching-scope-*`, `fast-mode-*`, `redact-thinking-*`, `token-efficient-tools-*`, `summarize-connector-text-*`, `afk-mode-*`, `advisor-tool-*`, `cache-editing-*`
- Per-model capability checks: `modelSupportsISP`, `modelSupportsContextManagement`, `modelSupportsStructuredOutputs`, `modelSupportsAutoMode`
- Provider-specific: Bedrock betas go in `extraBodyParams.anthropic_beta`, not the `betas` array
- SDK-provided betas filtered by allowlist

**What would change with AI SDK:**
- **MAJOR BLOCKER**: AI SDK has no beta header concept. These would need to be passed as provider-specific options or custom headers.
- The `@ai-sdk/anthropic` provider does support some features (thinking, tools) but not via explicit beta headers.
- Would need a custom extension to `@ai-sdk/anthropic` or direct header injection.

---

### `src/utils/thinking.ts` (~167 lines) — THINKING/REASONING SUPPORT

**Provider-specific:**
- `modelSupportsThinking()` — per-provider capability matrix
- `modelSupportsAdaptiveThinking()` — adaptive vs budget-based thinking
- OpenAI-compatible: delegates to `getTier1Capabilities()` registry
- Thinking config: `{ type: 'adaptive' }` or `{ type: 'enabled', budgetTokens }` or `{ type: 'disabled' }`

**What would change with AI SDK:**
- AI SDK supports `experimental_thinking` with `thinkingBudget` (as of early 2026)
- Adaptive thinking may not be supported — would need `providerOptions`
- `ultrathink` keyword detection stays as-is (UI feature)

---

### `src/utils/effort.ts` (~334 lines) — EFFORT LEVEL CONTROL

**Provider-specific:**
- `modelSupportsEffort()` — per-model/provider check
- `modelSupportsMaxEffort()` — Opus 4.6 only
- Maps effort levels (low/medium/high/max) to API `output_config.effort`
- Numeric effort override for ants via `anthropic_internal.effort_override`

**What would change with AI SDK:**
- **RISK**: AI SDK does not have a native effort parameter. Would need `providerOptions` or custom extension.
- OpenAI-compatible: effort maps to thinking budget via `mapEffortToThinkingBudget()`

---

### `src/services/api/errorUtils.ts` (~265 lines) — ERROR HANDLING

**Anthropic-specific:**
- `APIError` type from `@anthropic-ai/sdk`
- `sanitizeAPIError()`, `formatAPIError()` — format API error messages
- SSL error detection, connection error chain walking
- Nested error shapes for Bedrock vs standard API

**What would change with AI SDK:**
- Error types change to AI SDK's error hierarchy
- SSL/connection error detection stays (generic)
- Nested error shape handling would need adaptation for AI SDK's error wrapping

---

### `src/services/api/withRetry.ts` (~500+ lines) — RETRY LOGIC

**Anthropic-specific:**
- Uses `APIError`, `APIConnectionError`, `APIUserAbortError` from `@anthropic-ai/sdk`
- 529 (overloaded) detection and retry with model fallback
- 401 handling with OAuth token refresh
- AWS/GCP credential refresh on auth failures
- Rate limit/quota extraction from error responses

**What would change with AI SDK:**
- Error type detection would change to AI SDK types
- Retry logic conceptually stays but error matching adapts
- AI SDK has its own retry mechanism — might conflict or replace

---

### `src/services/tokenEstimation.ts`

**Anthropic-specific:**
- `anthropic.beta.messages.countTokens({...})` — token counting API
- `anthropic.beta.messages.create({...})` — used for token estimation fallback

**What would change with AI SDK:**
- **BLOCKER**: AI SDK has no token counting API equivalent
- Would need to keep Anthropic SDK just for `countTokens` or use tiktoken/approximation

---

### `src/services/claudeAiLimits.ts`

**Anthropic-specific:**
- Uses `anthropic.beta.messages` for rate limit probing
- Extracts quota status from response headers

**What would change with AI SDK:**
- **BLOCKER**: Provider-specific rate limit headers. AI SDK doesn't expose raw response headers.
- Would need a custom middleware or keep direct SDK usage for this

---

## Risk Assessment

### P0 Blockers (No AI SDK equivalent — must build adapter or keep Anthropic SDK)

| Feature | Used In | Impact |
|---|---|---|
| **Beta headers** (18+ distinct) | `betas.ts`, `claude.ts` | Core to every API call. No AI SDK concept. Need `providerOptions` or custom headers. |
| **Prompt caching** (`cache_control`, `ttl`, `scope`) | `claude.ts` | Critical for cost. AI SDK `@ai-sdk/anthropic` supports basic `cacheControl` but not `ttl: '1h'` or `scope: 'global'`. |
| **Token counting** (`messages.countTokens`) | `tokenEstimation.ts` | Used for context window management. No AI SDK equivalent. |
| **Rate limit/quota headers** | `claudeAiLimits.ts`, `withRetry.ts` | Subscriber experience. No AI SDK access to raw response headers. |
| **Effort parameter** (`output_config.effort`) | `claude.ts`, `effort.ts` | Default for most users. Not in AI SDK. |
| **Context management** (`context_management`) | `claude.ts` | Thinking preservation. Anthropic-only. |
| **Task budget** (`output_config.task_budget`) | `claude.ts` | API-side token budgeting. Not in AI SDK. |
| **Fast mode** (`speed: 'fast'`) | `claude.ts` | Latency optimization. Not in AI SDK. |
| **Advisor tool** (`server_tool_use`, `advisor_tool_result`) | `claude.ts` | Server-side tool. Not in AI SDK. |
| **Connector text** (anti-distillation) | `claude.ts` | Security feature. Not in AI SDK. |
| **Cache editing** (cached microcompact) | `claude.ts` | Cost optimization. Not in AI SDK. |

### P1 Risks (Partial AI SDK support — needs verification)

| Feature | AI SDK Status | Notes |
|---|---|---|
| **Extended thinking** (adaptive + budget) | `experimental_thinking` exists | `adaptive` type may not be supported. `signature` field handling unclear. |
| **Structured outputs** | `experimental_output` in AI SDK | Different API surface, may work with adaptation. |
| **Bedrock provider** | `@ai-sdk/amazon-bedrock` exists | Uses Converse API, NOT Anthropic Messages API. Beta headers, thinking, effort NOT supported. |
| **Vertex provider** | `@ai-sdk/google-vertex` exists | For Gemini, not Anthropic models on Vertex. Would need custom provider. |
| **Foundry (Azure) provider** | None exists | Must build custom AI SDK provider. |
| **Non-streaming fallback** | Not a concept in AI SDK | `generateText()` exists but no auto-fallback from `streamText()`. |
| **Stream idle watchdog** | Not in AI SDK | Would need custom implementation around AI SDK stream. |
| **Streaming tool execution** | AI SDK has tool streaming | May have different timing/granularity than current approach. |

### P2 Concerns (Likely solvable but need work)

| Feature | Notes |
|---|---|
| **Custom headers** (attribution, session, container) | AI SDK supports `headers` in provider config. |
| **Error type mapping** | Need adapter from AI SDK errors to current error handler expectations. |
| **Usage tracking** (cache tokens, server tool use, iterations) | AI SDK exposes usage but may not include all Anthropic-specific fields. |
| **Tool search** (defer_loading, tool_reference) | Would need client-side implementation for all providers, not just OpenAI. |
| **Prompt cache break detection** | Relies on response usage token fields. Needs AI SDK to expose these. |

---

## Migration Order Recommendation

### Phase 1: Foundation (lowest risk, highest learning)
1. **`src/services/api/openai/` (entire directory)** — Replace with `@ai-sdk/openai-compatible`. This is the cleanest migration: the code already translates to/from an abstraction layer. Delete ~1300 lines.
2. **`src/query/deps.ts`** — Simplify provider dispatch once OpenAI uses AI SDK.

### Phase 2: Client Factory
3. **`src/services/api/client.ts`** — Replace with AI SDK provider factory. Build custom providers for Foundry. Test that Bedrock/Vertex work with `@ai-sdk/anthropic` (NOT the Converse API providers).

### Phase 3: Core Streaming (highest risk, most complex)
4. **`src/services/api/claude.ts`** — The 3000-line monster. Migrate in sub-phases:
   a. Extract parameter building into a separate adapter module
   b. Replace streaming event processing with AI SDK's stream handling
   c. Keep non-streaming fallback as a separate path
   d. Build beta header injection via `providerOptions`/custom headers
   e. Build prompt caching adapter
   f. Migrate error handling

### Phase 4: Supporting Infrastructure
5. **`src/services/api/withRetry.ts`** — Adapt error types, possibly leverage AI SDK's built-in retries
6. **`src/services/api/errorUtils.ts`** — Adapter for AI SDK error shapes
7. **`src/utils/betas.ts`** — Convert to `providerOptions` builder
8. **`src/services/tokenEstimation.ts`** — Keep Anthropic SDK for `countTokens` (no AI SDK equivalent)
9. **`src/services/claudeAiLimits.ts`** — Keep Anthropic SDK for rate limit probing

### Phase 5: Type Updates (ripple effects)
10. **`src/query.ts`** — Update `ToolUseBlock`/`ToolResultBlockParam` types
11. **`src/services/tools/StreamingToolExecutor.ts`** — Update `ToolUseBlock` type
12. **`src/QueryEngine.ts`** — Update `ContentBlockParam` type

---

## Code Impact Estimate

### Can be deleted outright (~2200 lines)
- `src/services/api/openai/queryOpenAI.ts` (~560 lines)
- `src/services/api/openai/messageTranslation.ts` (~357 lines)
- `src/services/api/openai/types.ts` (~62 lines)
- `src/services/api/openai/config.ts` (~60 lines)
- `src/services/api/openai/clientToolSearch.ts` (~270 lines)
- Streaming event switch in `claude.ts` (~350 lines)
- SSE parsing code (~50 lines)
- Parameter building in `claude.ts` that duplicates AI SDK features (~200 lines)
- `cleanupStream()` and resource management (~50 lines)
- Large portions of `client.ts` (~300 lines)

### Needs adapter layers (~800-1200 new lines)
- Beta header -> `providerOptions` mapper
- Prompt caching adapter (cache_control, ttl, scope)
- Effort parameter adapter
- Error type adapter (APIError -> AI SDK errors and back)
- Usage tracking adapter (Anthropic fields -> AI SDK usage -> internal format)
- Non-streaming fallback wrapper around AI SDK
- Stream idle watchdog wrapper
- Context management adapter
- Custom Foundry provider for AI SDK

### Must keep as-is (no AI SDK replacement)
- `src/services/tokenEstimation.ts` — `countTokens` API
- `src/services/claudeAiLimits.ts` — Rate limit probing
- `src/utils/model/bedrock.ts` — Bedrock infra (inference profiles, ARNs)
- `src/utils/model/model.ts` — Model resolution (provider-agnostic)
- `src/utils/model/providers.ts` — Provider detection
- `src/utils/thinking.ts` — Mostly provider-agnostic logic
- `src/utils/effort.ts` — Mostly provider-agnostic logic
- `src/services/tools/StreamingToolExecutor.ts` — Provider-agnostic (minor type changes)
- `src/query.ts` — Mostly provider-agnostic (minor type changes)

---

## Key Architectural Observation

The codebase already has a **de facto provider abstraction** via `src/query/deps.ts`. The `callModel` dependency is swapped at runtime based on the provider. The OpenAI adapter (`queryOpenAI.ts`) already synthesizes Anthropic-format events from OpenAI SSE.

This means the migration can be done incrementally: replace the `callModel` implementations one provider at a time while keeping the `StreamEvent` / `AssistantMessage` / `ToolUseBlock` types as an internal intermediate representation. The AI SDK would produce its own types, and a thin adapter would convert them to the existing internal types.

**The biggest blocker is not the streaming or tool protocol — it's the 18+ beta headers and Anthropic-specific API parameters (effort, task_budget, context_management, speed, cache_control with scope/ttl) that have no AI SDK equivalent.** Until AI SDK's `@ai-sdk/anthropic` provider supports passing these through `providerOptions` or custom extensions, a full migration is not possible without losing functionality.

### Recommended Strategy
Rather than a "big bang" migration, build a **thin AI SDK adapter layer** that:
1. Uses `@ai-sdk/openai-compatible` for open models (replacing the entire `openai/` directory)
2. Uses `@ai-sdk/anthropic` for first-party Anthropic with heavy `providerOptions` / `headers` injection
3. Keeps direct Anthropic SDK for Bedrock/Vertex/Foundry until AI SDK providers mature
4. Keeps direct Anthropic SDK for `countTokens` and rate limit probing
