# Noble Base Code — Architecture Guide

> Updated 2026-04-04. Covers the current dual-renderer state (React+Ink / OpenTUI+SolidJS),
> the External Model Registry, the AI SDK migration, and the full message lifecycle.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [CLI Rendering System](#cli-rendering-system)
3. [Message Lifecycle — Step by Step](#message-lifecycle--step-by-step)
4. [Query Engine & API Providers](#query-engine--api-providers)
5. [Tool System](#tool-system)
6. [Context Management & Compaction](#context-management--compaction)
7. [Bridge & Remote Execution](#bridge--remote-execution)
8. [Hook System](#hook-system)
9. [Commands & Skills](#commands--skills)
10. [External Model Registry](#external-model-registry)
11. [Session Persistence](#session-persistence)
12. [Feature Flags](#feature-flags)
13. [Appendix: File Map](#appendix-file-map)

---

## High-Level Overview

Noble Base Code is an unlocked CLI coding agent forked from Anthropic's Claude Code.
It supports both Anthropic models (via the Anthropic SDK) and OpenAI-compatible
endpoints (vLLM, TGI, HF Inference) via a provider abstraction layer.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER (terminal)                                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CLI Entrypoint            src/entrypoints/cli.tsx                       │
│  ├── Flag parsing (--version, --model, -p, etc.)                        │
│  ├── Environment setup (heap size, feature flags)                       │
│  └── Routes to: main CLI | MCP server | daemon worker                   │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Application Bootstrap     src/main.tsx                                  │
│  ├── Load config, permissions, MCP connections                          │
│  ├── Initialize tool pool                                               │
│  ├── Select renderer (Ink or OpenTUI based on env flag)                 │
│  └── Mount REPL screen                                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  REPL Loop                 src/screens/REPL.tsx                          │
│  ├── Prompt input → message processing → query orchestration            │
│  ├── Stream rendering → tool execution → loop until end_turn            │
│  └── Session persistence, cost tracking, hook execution                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Dependencies

| Package | Role |
|---|---|
| `@anthropic-ai/sdk` | Anthropic API client (first-party, Bedrock, Vertex, Foundry) |
| `ai` (Vercel AI SDK) | Provider-neutral model abstraction (migration in progress) |
| `@ai-sdk/openai-compatible` | OpenAI-compatible endpoint adapter |
| `@opentui/core` + `@opentui/solid` | Next-gen terminal rendering engine |
| `react` + custom Ink fork | Current (legacy) terminal rendering engine |
| `solid-js` | Reactive UI framework paired with OpenTUI |
| `@modelcontextprotocol/sdk` | MCP client for external tool servers |
| `drizzle-orm` | Database ORM (persistence layer) |

---

## CLI Rendering System

The application is in a **transitional dual-renderer state**. Both systems coexist
and are selectable via environment variable.

### Architecture: Ink (Legacy) vs OpenTUI (New)

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│  LEGACY: React + Ink            │    │  NEW: SolidJS + OpenTUI         │
│                                 │    │                                 │
│  React VDOM                     │    │  SolidJS reactive signals       │
│    ↓                            │    │    ↓                            │
│  Custom Ink reconciler          │    │  Direct DOM mutations           │
│    ↓                            │    │  (no VDOM diffing)              │
│  Yoga flexbox layout            │    │    ↓                            │
│    ↓                            │    │  OpenTUI Zig core               │
│  ANSI output                    │    │  (cell buffer + frame diff)     │
│                                 │    │    ↓                            │
│  ~40 KB runtime                 │    │  ANSI output                    │
│  ~77K lines UI code             │    │                                 │
│                                 │    │  ~7-8 KB runtime                │
│  Entry: src/main.tsx            │    │  272 ported components          │
│  Components: src/components/    │    │                                 │
│                                 │    │  Entry: src/entrypoints/        │
│                                 │    │         cli-solid.tsx           │
│                                 │    │  Components: src/ui/solid/      │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

### Renderer Selection

```typescript
// In src/entrypoints/cli-solid.tsx:
process.env.NOBLE_BASE_CODE_RENDERER = 'opentui'

// In src/main.tsx — checks this flag to choose renderer:
// - 'opentui' → createSolidRoot() from src/ui/solid/render.ts
// - default   → Ink's createRoot()
```

### OpenTUI Component Model

OpenTUI provides native terminal primitives as JSX elements:

| Element | Purpose |
|---|---|
| `<box>` | Flexbox container (like `<div>`) |
| `<text>` | Text rendering |
| `<scrollbox>` | Scrollable container with sticky-scroll support |
| `<textarea>` | Multi-line text input |
| `<input>` | Single-line text input |
| `<select>` | Selection menu |
| `<markdown>` | Markdown rendering |
| `<code>` | Syntax-highlighted code block |
| `<diff>` | Diff rendering |
| `<a href="...">` | Clickable terminal hyperlink |

### OpenTUI Hook Mapping

| Ink (Legacy) | OpenTUI (New) | Notes |
|---|---|---|
| `useInput(handler)` | `useKeyboard(handler)` | Adapted event shape |
| `useApp()` | `useRenderer()` | For `stop()` / exit |
| `useTerminalViewport()` | `useTerminalDimensions()` | Returns reactive Accessor |
| `useSelection()` | `useSelectionHandler()` | Text selection events |
| `useAnimationFrame(cb)` | `useTimeline({ loop: true })` | Animation frame loop |
| `useTerminalFocus()` | `onFocus()` / `onBlur()` | Lifecycle hooks |

### Build System: Dual-JSX Transform

The build uses a **dual-JSX Bun plugin** (`plugins/solid-transform.ts`):

- Files ending in `.solid.tsx` → transformed via `babel-preset-solid` with `@opentui/solid` as JSX module
- All other `.tsx` → handled by React's JSX transform
- Separate `tsconfig.solid.json` with `jsxImportSource: "@opentui/solid"`

### OpenTUI File Structure

```
src/ui/solid/
├── render.ts              — createSolidRoot() adapter (wraps OpenTUI render)
├── hooks.ts               — Custom hook adapters wrapping OpenTUI hooks
├── index.ts               — Barrel export
├── components/            — Base UI (Box, Text, Button, ScrollBox, App, etc.)
├── design-system/         — Themed components (ThemedText, Dialog, etc.)
├── messages/              — Message rendering components
├── permissions/           — Permission dialog components
├── mcp/                   — MCP server integration UI
├── screens/               — Full screens (REPL, Doctor, Resume)
├── PromptInput/           — Prompt input component
├── tasks/                 — Task management UI
├── agents/                — Agent-related UI
├── LogoV2/                — Logo and welcome screen
├── HelpV2/                — Help screen
├── FeedbackSurvey/        — Feedback survey UI
└── Spinner/               — Loading spinners
```

**Stats:** 272 `.solid.tsx` files ported. ~20,774 lines of Ink framework code will be removed once migration is confirmed complete.

### Ink Removal Plan (Post-Migration)

Once OpenTUI is confirmed stable:
1. Delete `src/ink/` (~20K lines) and Yoga port
2. Remove React dependencies (`react`, `react-reconciler`, `ink`, `@types/react`)
3. Update `tsconfig.json` to use `jsxImportSource: "@opentui/solid"`
4. Rename `.solid.tsx` → `.tsx` (convention no longer needed)
5. Update entry point from Ink's `createRoot()` to OpenTUI's `createSolidRoot()`

See `docs/ink-removal-manifest.md` for the full step-by-step procedure.

---

## Message Lifecycle — Step by Step

This traces exactly what happens from the moment you press Enter in the terminal
to when the response finishes rendering.

### Phase 1: Input Capture

```
User types text in terminal
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PromptInput component                                              │
│  (src/components/PromptInput/ or src/ui/solid/PromptInput/)         │
│                                                                     │
│  - Captures keystrokes, manages cursor, vim mode                    │
│  - Handles history (up/down arrows)                                 │
│  - Detects slash commands (/ prefix)                                │
│  - Handles pasted content and image attachments                     │
│  - On Enter → calls onSubmit callback                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
```

### Phase 2: Input Processing

```
┌─────────────────────────────────────────────────────────────────────┐
│  handlePromptSubmit()     src/utils/handlePromptSubmit.ts            │
│                                                                     │
│  1. Check message queue — if queued commands exist, run from queue   │
│  2. Validate input (empty check, exit commands)                     │
│  3. Expand [Pasted text #N] placeholders with actual content        │
│  4. Filter image attachments (keep only referenced ones)            │
│  5. Detect slash commands:                                          │
│     - Local commands (e.g. /config, /help) → execute immediately    │
│     - Prompt commands → prepare as query input                      │
│  6. Call executeUserInput()                                         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  processUserInput()       src/utils/processUserInput/                │
│                                                                     │
│  1. Parse slash commands if enabled                                 │
│  2. Execute pre-prompt submission hooks                             │
│  3. Create attachment messages for pasted content                   │
│  4. Create UserMessage object(s) with content blocks                │
│  5. Extract image metadata                                          │
│  6. Return: { messages, shouldQuery, allowedTools }                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  executeUserInput()       (within handlePromptSubmit.ts)             │
│                                                                     │
│  1. Update UI: show input as processing                             │
│  2. Clear prompt input buffer                                       │
│  3. Add input to history ring                                       │
│  4. Create AbortController for this query                           │
│  5. Build complete message array                                    │
│  6. Call onQuery() callback → enters REPL query orchestration       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
```

### Phase 3: Query Orchestration

```
┌─────────────────────────────────────────────────────────────────────┐
│  onQuery()                src/screens/REPL.tsx                       │
│                                                                     │
│  1. Concurrency guard: queryGuard.tryStart()                        │
│     - If another query is running → enqueue, return                 │
│  2. Reset timing refs and metrics                                   │
│  3. Execute onBeforeQuery callback                                  │
│  4. Delegate to onQueryImpl()                                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  onQueryImpl()            src/screens/REPL.tsx                       │
│                                                                     │
│  1. Close IDE open diffs, mark onboarding complete                  │
│  2. Generate session title from first user message                  │
│  3. Update tool permission context                                  │
│  4. Build system prompt:                                            │
│     ├── Agent definition (identity, capabilities)                   │
│     ├── Memory files (from ~/.claude/)                              │
│     ├── Tool descriptions (all registered tools)                    │
│     ├── System context (git info, env, CWD)                         │
│     └── User context (custom system prompts)                        │
│  5. Call core query engine ↓                                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
```

### Phase 4: Core Query Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│  query()                  src/query.ts                               │
│  queryLoop()              (the main while loop)                      │
│                                                                     │
│  LOOP START:                                                        │
│  │                                                                  │
│  ├── 1. Check token budget and auto-compact thresholds              │
│  │      If context too large → trigger compaction (see §5)          │
│  │                                                                  │
│  ├── 2. Prepare messages for API call:                              │
│  │      ├── Apply snip compaction (remove old low-priority details)  │
│  │      ├── Apply microcompact (per-message summarization)          │
│  │      └── Apply tool result budget (truncate large results)       │
│  │                                                                  │
│  ├── 3. Get dependencies via productionDeps():                      │
│  │      src/query/deps.ts                                           │
│  │      ├── callModel: provider-specific streaming function          │
│  │      ├── microcompact: microcompactMessages                      │
│  │      ├── autocompact: autoCompactIfNeeded                        │
│  │      └── uuid: randomUUID                                        │
│  │                                                                  │
│  ├── 4. PROVIDER FORK — deps.callModel() dispatches to:             │
│  │      ├── Anthropic → queryModelWithStreaming (claude.ts)          │
│  │      └── OpenAI   → queryModelOpenAIWithStreaming (queryOpenAI.ts)│
│  │                                                                  │
│  ├── 5. Stream response events to UI (see Phase 5)                  │
│  │                                                                  │
│  ├── 6. Extract tool_use blocks from AssistantMessage                │
│  │      Execute tools via runTools() (see §Tool System)             │
│  │                                                                  │
│  ├── 7. Check terminal condition:                                   │
│  │      ├── stop_reason=end_turn    → EXIT LOOP (done)              │
│  │      ├── stop_reason=tool_use    → append results, CONTINUE      │
│  │      ├── max_output_tokens error → increase limit, CONTINUE      │
│  │      └── context too large       → compact and CONTINUE          │
│  │                                                                  │
│  └── LOOP END (goto LOOP START if continuing)                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
```

### Phase 5: API Call & Streaming

```
               ┌────────────────────────────────────┐
               │         PROVIDER FORK               │
               └─────┬──────────────────┬────────────┘
                     │                  │
          ┌──────────▼─────────┐  ┌────▼───────────────────────┐
          │  ANTHROPIC PATH    │  │  OPENAI-COMPATIBLE PATH    │
          │  src/services/api/ │  │  src/services/api/openai/  │
          │  claude.ts         │  │  queryOpenAI.ts            │
          └──────────┬─────────┘  └────┬───────────────────────┘
                     │                  │
                     ▼                  ▼
```

#### Anthropic Path (Default)

```
queryModelWithStreaming() → queryModel()
│
├── 1. Beta header negotiation
│   getMergedBetas() → 20+ Anthropic-specific headers
│   (interleaved-thinking, context-1m, prompt-caching, etc.)
│
├── 2. Tool schema building
│   toolToAPISchema() → BetaToolUnion[]
│   (adds strict, eager_input_streaming, defer_loading)
│
├── 3. Message normalization
│   normalizeMessagesForAPI() → MessageParam[]
│   userMessageToMessageParam() / assistantMessageToMessageParam()
│   ensureToolResultPairing()
│
├── 4. System prompt construction
│   buildSystemPromptBlocks()
│   ├── Attribution header
│   ├── CLI system prompt prefix
│   ├── User system prompt
│   └── Advisor/tool-search instructions
│
├── 5. Request parameters
│   BetaMessageStreamParams:
│   ├── model, max_tokens, messages, tools
│   ├── thinking: {type:'adaptive'} or {budget_tokens:N}
│   ├── speed: 'fast' (optional)
│   ├── betas: [...beta headers]
│   ├── output_config: {effort, task_budget, format}
│   └── metadata, cache_control
│
├── 6. Client creation
│   getAnthropicClient() → Anthropic SDK client
│   (firstParty / Bedrock / Vertex / Foundry)
│
├── 7. API call with retry
│   withRetry() → anthropic.beta.messages.create({stream:true})
│   (handles 529, 500+, streaming fallback, model fallback)
│
└── 8. Stream processing
    for await (const part of stream):
    ├── message_start    → Initialize response, usage tracking
    ├── content_block_start
    │   ├── text         → New text content block
    │   ├── tool_use     → New tool invocation
    │   ├── thinking     → Extended thinking block
    │   └── server_tool_use → Advisor tool
    ├── content_block_delta
    │   ├── text_delta        → Append text to UI
    │   ├── input_json_delta  → Append tool input JSON
    │   └── thinking_delta    → Append thinking text
    ├── content_block_stop → Yield complete AssistantMessage
    ├── message_delta      → Final usage + stop_reason
    └── message_stop       → End of message
```

#### OpenAI-Compatible Path

```
queryModelOpenAIWithStreaming()
│
├── 1. Message normalization (REUSES Anthropic normalizer)
│
├── 2. Format conversion (NEW layer)
│   src/services/api/openai/messageTranslation.ts
│   ├── anthropicMessagesToOpenAI()
│   │   ├── text blocks → {role:'user', content:'...'}
│   │   ├── tool_result → {role:'tool', tool_call_id:'...'}
│   │   ├── tool_use   → {role:'assistant', tool_calls:[...]}
│   │   └── STRIPS: thinking, connector_text, server_tool_use
│   ├── anthropicToolsToOpenAI()
│   └── systemPromptToOpenAI()
│
├── 3. HTTP request (raw fetch, NO Anthropic SDK)
│   POST ${OPENAI_BASE_URL}/chat/completions
│   Body: {model, messages, tools, stream:true, max_tokens, temperature}
│   Headers: Authorization: Bearer ${OPENAI_API_KEY}
│
├── 4. SSE stream parsing
│   parseSSEStream() → yields OpenAIStreamChunk
│   Handles: data: lines, [DONE] sentinel
│
└── 5. Event translation to Anthropic format
    OpenAI chunks → Synthesized Anthropic-shaped events:
    ┌─────────────────────────┬────────────────────────────┐
    │ OpenAI                  │ Synthesized Anthropic       │
    ├─────────────────────────┼────────────────────────────┤
    │ First chunk             │ message_start              │
    │ delta.content (new)     │ content_block_start (text) │
    │ delta.content (ongoing) │ content_block_delta        │
    │ delta.tool_calls[i]     │ content_block_start        │
    │   (new, has id+name)    │   (tool_use)               │
    │ delta.tool_calls[i]     │ content_block_delta        │
    │   (args fragment)       │   (input_json_delta)       │
    │ finish_reason           │ content_block_stop(s)      │
    │                         │ message_delta              │
    │                         │ message_stop               │
    └─────────────────────────┴────────────────────────────┘
```

### Phase 6: Response Rendering

```
Stream events arrive
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  onQueryEvent()           src/screens/REPL.tsx                       │
│                                                                     │
│  For each stream event:                                             │
│  ├── Text deltas      → update response length counter              │
│  ├── Compact boundary  → replace old messages with summary          │
│  ├── Progress events   → replace (not append) in message list       │
│  └── Other messages    → append to conversation history             │
│                                                                     │
│  Calls setMessages() → triggers React/SolidJS re-render             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Messages component       src/components/Messages.tsx                │
│                           (or src/ui/solid/messages/)               │
│                                                                     │
│  - Virtual scrolling for performance (only visible rows render)     │
│  - Memoized row components per message type:                        │
│    ├── UserMessage      → User input text + attachments             │
│    ├── AssistantMessage  → Model response (text + thinking)         │
│    ├── ProgressMessage   → Tool progress (streaming updates)        │
│    ├── ToolUseSummary    → Aggregated tool history                  │
│    └── CompactBoundary   → Context compaction marker                │
│  - Content blocks within AssistantMessage:                          │
│    ├── Text blocks      → Markdown rendering                       │
│    ├── Tool use blocks  → Collapsible tool call details             │
│    └── Thinking blocks  → Extended thinking display                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 7: Turn Completion

```
┌─────────────────────────────────────────────────────────────────────┐
│  onQuery() finally block  src/screens/REPL.tsx                       │
│                                                                     │
│  1. Release query guard → queryGuard.end()                          │
│  2. Log completion time and track session latency                   │
│  3. Capture metrics (TTFT, OTPS, hook duration, tool count)         │
│  4. Create API metrics message and add to history                   │
│  5. Reset loading state (clear spinners)                            │
│  6. Execute onTurnComplete hook                                     │
│  7. Send bridge result (notify remote client)                       │
│  8. Show turn duration (if > 30s or on token budget)                │
│  9. Clear abort controller                                          │
│  10. Process message queue (start next queued message if any)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Provider Detection Flow

```
Environment Variables
         │
         ▼
src/utils/model/providers.ts: getAPIProvider()
         │
         ├── OPENAI_COMPATIBLE=true  ──────────► 'openai_compatible'
         ├── CLAUDE_CODE_USE_BEDROCK=true ─────► 'bedrock'
         ├── CLAUDE_CODE_USE_VERTEX=true ──────► 'vertex'
         ├── CLAUDE_CODE_USE_FOUNDRY=true ─────► 'foundry'
         └── (default) ───────────────────────► 'firstParty'
```

### Capability Matrix by Provider

| Feature | Anthropic (1P) | Bedrock/Vertex/Foundry | OpenAI-Compatible |
|---|---|---|---|
| Extended thinking | Yes | Yes | No (stripped) |
| Effort control | Yes | Yes | No |
| Beta headers | 20+ headers | Subset | None |
| Prompt caching | Yes | Limited | No |
| Fast mode | Yes | No | No |
| Advisor tool | Yes | No | No |
| Tool search | Yes | No | Client-side only |
| Context management | Yes | No | No |
| 1M context | Yes (with beta) | No | Model-dependent |
| Streaming | SSE via SDK | SSE via SDK | Raw SSE fetch |

---

## Query Engine & API Providers

### Dependency Injection

The query loop uses dependency injection for testability and provider switching:

```typescript
// src/query/deps.ts
productionDeps() → {
  callModel:    // Anthropic OR OpenAI streaming function
  microcompact: // Context summarization
  autocompact:  // Automatic context reduction
  uuid:         // ID generation
}
```

The `callModel` function is selected at initialization based on `getAPIProvider()`.
Both paths return the same `AsyncGenerator<StreamEvent | AssistantMessage>` type,
so `query.ts` is provider-agnostic after the fork point.

### Message Type System

The application is migrating from Anthropic SDK types to provider-neutral internal types:

```
Anthropic SDK Types (legacy)        Internal Types (new)
─────────────────────────           ──────────────────────
BetaMessage                    →    InternalAssistantMessage
BetaMessageParam               →    InternalMessage
BetaContentBlock               →    InternalContentBlock
BetaToolUseBlock               →    InternalToolUseBlock
BetaToolResultBlockParam       →    InternalToolResultBlock
```

**Migration status:** ~70% complete. Converters exist in `src/services/api/converters/`:
- `anthropic.ts` — Anthropic SDK ↔ Internal format
- `ai-sdk.ts` — Vercel AI SDK ↔ Internal format
- Remaining: core query loop and tool execution still use Anthropic types directly

See `src/services/api/converters/MIGRATION_STATUS.md` for phase-by-phase progress.

---

## Tool System

### Tool Architecture

```
src/tools/
├── BashTool/             — Shell command execution (with PersistentShell)
├── FileReadTool/         — File reading with line ranges and image support
├── FileEditTool/         — Exact string replacement in files
├── FileWriteTool/        — File creation and overwrite
├── GlobTool/             — File pattern matching (ripgrep-backed)
├── GrepTool/             — Content search (ripgrep-backed)
├── AgentTool/            — Subagent spawning (fork subprocess)
├── WebFetchTool/         — HTTP fetch with rendering
├── WebSearchTool/        — Web search
├── LSPTool/              — Language Server Protocol queries
├── SkillTool/            — Skill/command invocation
├── MCPTool/              — MCP server tool calls
├── NotebookEditTool/     — Jupyter notebook editing
├── TaskCreateTool/       — Task list management
├── TaskUpdateTool/       — Task status updates
├── TaskGetTool/          — Task retrieval
├── TaskListTool/         — Task listing
├── TaskOutputTool/       — Task output viewing
├── TaskStopTool/         — Task cancellation
├── SendMessageTool/      — Inter-agent messaging
├── EnterPlanModeTool/    — Plan mode entry
├── ExitPlanModeTool/     — Plan mode exit
├── EnterWorktreeTool/    — Git worktree isolation
├── ExitWorktreeTool/     — Git worktree cleanup
├── TodoWriteTool/        — Todo list management
├── ToolSearchTool/       — Deferred tool discovery
├── ScheduleCronTool/     — Cron job scheduling
├── RemoteTriggerTool/    — Remote agent triggers
├── ConfigTool/           — Configuration management
├── SleepTool/            — Delay execution
├── BriefTool/            — Brief mode output
├── TungstenTool/         — Tungsten panel management
├── WorkflowTool/         — Workflow script execution
├── VerifyPlanExecutionTool/ — Plan verification
├── REPLTool/             — REPL interaction
├── PowerShellTool/       — PowerShell execution (Windows)
├── AskUserQuestionTool/  — Interactive user prompts
├── SyntheticOutputTool/  — Synthetic output generation
├── TeamCreateTool/       — Team management
├── TeamDeleteTool/       — Team deletion
├── McpAuthTool/          — MCP authentication
├── ListMcpResourcesTool/ — MCP resource listing
└── ReadMcpResourceTool/  — MCP resource reading
```

### Tool Execution Flow

```
Tool use block detected in AssistantMessage
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Tool Orchestration       src/services/tools/toolOrchestration.ts    │
│  runTools()                                                         │
│                                                                     │
│  1. Partition tools by concurrency safety:                          │
│     ├── Read-only tools (Glob, Grep, Read) → batch concurrently    │
│     └── Write tools (Edit, Write, Bash) → run serially             │
│  2. For concurrent batch: Promise.all (up to 10 parallel)          │
│  3. For serial tools: execute one at a time                         │
│  4. Yield messages and updated context as tools complete            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Tool Execution           src/services/tools/toolExecution.ts        │
│  runToolUse()                                                       │
│                                                                     │
│  1. Parse input — validate with tool's Zod input schema             │
│  2. Pre-tool hooks — execute runPreToolUseHooks()                   │
│  3. Permission check — canUseTool() verifies user allowed it        │
│  4. Execute tool — call tool's execute() method                     │
│     (can yield ProgressMessages during execution)                   │
│  5. Handle result:                                                  │
│     ├── Success → ToolResultBlockParam                              │
│     ├── Error   → error result                                      │
│     └── Denied  → permission denied result                          │
│  6. Post-tool hooks — execute runPostToolUseHooks()                 │
│  7. Yield result messages                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Streaming Tool Executor

For tool calls that arrive during streaming (before the full message completes):

```
src/services/tools/StreamingToolExecutor.ts

StreamingToolExecutor:
  addTool()         — Queue tool as its content_block_start arrives
  processQueue()    — Execute tools respecting concurrency limits
  getRemainingResults() — Async generator for results after stream ends
```

### Subagent System (AgentTool)

The AgentTool spawns isolated subprocess agents with their own query loops:

```
src/tools/AgentTool/
├── runAgent.ts          — Main agent execution loop
├── forkSubagent.ts      — Subprocess forking
├── agentToolUtils.ts    — Agent type resolution, prompt building
└── UI.tsx               — Agent progress rendering

Agent types: general-purpose, Explore, Plan, pr-reviewer,
             gsd-executor, gsd-planner, gsd-debugger, etc.
```

Each agent gets:
- Its own query loop (separate conversation context)
- A subset of tools based on agent type
- Optional git worktree isolation
- Communication back via result message

---

## Context Management & Compaction

The application manages context window limits through multiple strategies:

### Auto-Compact

```
src/services/compact/autoCompact.ts

Triggers when context exceeds token threshold.
1. Build compaction request with message boundaries
2. Call API with special system prompt to summarize old messages
3. Replace old messages with compact boundary + summary
4. Continue with reduced token count
```

### Microcompact

```
src/services/compact/microCompact.ts (+ apiMicrocompact.ts)

Lightweight per-message summarization:
- Applied before full compaction
- Enables cache_control=ephemeral on long contexts
- Preserves message structure while reducing detail
```

### Snip Compaction

```
src/services/compact/snipCompact.ts

Surgical removal of low-priority details:
- Applied before microcompact
- Targets verbose tool results, repeated patterns
- Preserves semantic structure
```

### Token Budget Tracking

When the `TOKEN_BUDGET` feature flag is enabled:
- Tracks cumulative input/output tokens per session
- Warns user as budget approaches limit
- Can automatically compact when budget is tight

---

## Bridge & Remote Execution

The bridge system enables remote clients (Claude.ai web, mobile) to interact with
a local CLI session.

```
src/bridge/
├── replBridge.ts           — ReplBridgeHandle (main interface)
├── replBridgeTransport.ts  — Transport layer (REST + WebSocket)
├── bridgeMessaging.ts      — Message format conversion
├── inboundMessages.ts      — Process remote → local messages
├── inboundAttachments.ts   — Handle remote file attachments
└── sessionRunner.ts        — Session lifecycle management

Transport modes:
├── V1: REST-based polling
├── V2: WebSocket-based streaming
└── Hybrid: Both for redundancy
```

### Bridge Message Flow

```
Remote client (web/mobile)
         │
         ▼
Bridge transport (WebSocket/REST)
         │
         ▼
handleIngressMessage() → process remote input
         │
         ▼
REPL query loop (same as local)
         │
         ▼
makeResultMessage() → format response for remote
         │
         ▼
Remote client renders response
```

---

## Hook System

Hooks are user-defined shell commands that execute at specific lifecycle points.
Configured in `settings.json` via the `/update-config` skill.

```
src/utils/hooks.ts (1000+ lines)

Hook lifecycle:
┌─────────────────────────────────────────────────────────────────────┐
│  Session Start                                                      │
│  ├── setupHook (first time only)                                    │
│  └── sessionStartHook                                               │
│                                                                     │
│  Before Each Query                                                  │
│  └── userPromptSubmitHook                                           │
│                                                                     │
│  During Query — For Each Tool                                       │
│  ├── preToolUseHook (before tool executes)                          │
│  │   Can: modify input, deny execution                              │
│  ├── postToolUseHook (after tool succeeds)                          │
│  │   Can: process results, trigger side effects                     │
│  └── postToolUseFailureHook (on tool error)                         │
│                                                                     │
│  After Query                                                        │
│  └── postSamplingHook (with model response)                         │
│                                                                     │
│  Session End                                                        │
│  └── sessionEndHook                                                 │
└─────────────────────────────────────────────────────────────────────┘

Hook I/O:
- Input:  JSON with hook event data (tool name, input, result, etc.)
- Output: JSON result, prompt request/response, or denial
- Async hooks run in background and inject HookResultMessage
```

---

## Commands & Skills

### Slash Commands

Commands are invoked with `/<name>` in the prompt. There are ~60+ built-in commands
plus user-defined skills and plugins.

#### Core Commands

| Command | Type | Description |
|---|---|---|
| `/help` | local | Show help screen |
| `/clear` | local | Clear conversation |
| `/compact` | local | Compress context |
| `/config` | local-jsx | Open configuration |
| `/cost` | local | Show session cost |
| `/diff` | local | Show file changes |
| `/doctor` | local-jsx | Diagnose issues |
| `/exit` | local | Exit the CLI |
| `/model` | local-jsx | Switch model |
| `/resume` | local-jsx | Resume previous session |
| `/status` | local | Show session status |
| `/usage` | local | Show usage info |
| `/stats` | local | Session statistics |

#### Development Commands

| Command | Type | Description |
|---|---|---|
| `/review` | prompt | Code review |
| `/ultrareview` | prompt | Deep code review |
| `/security-review` | prompt | Security audit |
| `/plan` | local | Toggle plan mode |
| `/fast` | local | Toggle fast output mode |
| `/effort` | local | Set thinking effort level |
| `/diff` | local | Show uncommitted changes |
| `/branch` | local | Branch management |
| `/files` | local | List tracked files |
| `/undo` | local | Undo last file change |
| `/rewind` | local-jsx | Rewind conversation state |

#### Configuration Commands

| Command | Type | Description |
|---|---|---|
| `/permissions` | local-jsx | Manage tool permissions |
| `/hooks` | local | Manage lifecycle hooks |
| `/keybindings` | local | Manage keyboard shortcuts |
| `/theme` | local | Change terminal theme |
| `/color` | local | Change agent color |
| `/vim` | local | Toggle vim mode |
| `/statusline` | local | Toggle status line |
| `/privacy-settings` | local-jsx | Privacy configuration |
| `/sandbox-toggle` | local | Toggle sandbox mode |
| `/output-style` | local | Change output formatting |
| `/terminal-setup` | local-jsx | Terminal configuration |

#### Integration Commands

| Command | Type | Description |
|---|---|---|
| `/mcp` | local-jsx | Manage MCP servers |
| `/ide` | local-jsx | IDE integration setup |
| `/desktop` | local-jsx | Desktop app handoff |
| `/mobile` | local | Mobile QR code |
| `/chrome` | local | Chrome extension setup |
| `/plugin` | local-jsx | Plugin management |
| `/agents` | local-jsx | Agent management |
| `/skills` | local-jsx | Skill management |

#### Session Commands

| Command | Type | Description |
|---|---|---|
| `/session` | local-jsx | Session management |
| `/rename` | local | Rename session |
| `/copy` | local | Copy last message |
| `/export` | local | Export conversation |
| `/tag` | local | Tag conversation |
| `/memory` | local-jsx | Memory management |
| `/tasks` | local-jsx | Task management |
| `/insights` | prompt | Session analytics report |

#### Feature-Gated Commands (Experimental)

| Command | Gate | Description |
|---|---|---|
| `/voice` | `VOICE_MODE` | Voice input mode |
| `/bridge` | `BRIDGE_MODE` | Remote control session |
| `/proactive` | `PROACTIVE` | Proactive agent mode |
| `/brief` | `KAIROS_BRIEF` | Brief transcript layout |
| `/workflows` | `WORKFLOW_SCRIPTS` | Workflow automation |
| `/fork` | `FORK_SUBAGENT` | Fork subagent |
| `/buddy` | `BUDDY` | Buddy agent |
| `/ultraplan` | `ULTRAPLAN` | Deep planning mode |
| `/force-snip` | `HISTORY_SNIP` | Force context snip |
| `/peers` | `UDS_INBOX` | Peer agent communication |

### Command Types

| Type | Behavior |
|---|---|
| `local` | Executes immediately, returns text output |
| `local-jsx` | Executes immediately, renders interactive UI (Ink/OpenTUI) |
| `prompt` | Expands to a prompt sent to the model |

### Skills System

Skills extend commands with user-defined and bundled capabilities:

```
Skill sources (loaded in order):
1. Bundled skills    — shipped with the application
2. Built-in plugin   — from enabled plugins
   skills
3. Skill directory   — from ~/.claude/skills/ and .claude/skills/
   commands
4. Workflow commands  — from workflow definitions
5. Plugin commands    — from installed plugins
6. Plugin skills     — skills provided by plugins
7. Dynamic skills    — discovered during file operations
```

Skills are `prompt`-type commands that the model can invoke via the SkillTool.

---

## External Model Registry

The External Model Registry provides model metadata through a layered caching system.
This is the model-agnostic replacement for hardcoded model tables.

### Architecture

```
src/models/
├── registry.ts    — Main registry with layered resolution
├── types.ts       — Zod schemas and TypeScript types
├── fallback.ts    — Hardcoded fallback registry
└── index.ts       — Barrel export
```

### Resolution Strategy (3-tier with background refresh)

```
Request for model metadata
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Tier 1: In-memory cache (5-minute TTL)                             │
│  Fastest — used for hot-path lookups                                │
│  If hit → return immediately                                        │
└─────────┬──────────────────────────┬────────────────────────────────┘
          │ miss                     │
          ▼                          │
┌─────────────────────────────────┐  │
│  Tier 2: Local file             │  │
│  ~/.claude/models.json          │  │
│  User-specified or previously   │  │
│  fetched models                 │  │
│  If hit → return + cache in T1  │  │
└─────────┬───────────────────────┘  │
          │ miss                     │
          ▼                          │
┌─────────────────────────────────┐  │
│  Tier 3: Remote disk cache      │  │
│  ~/.claude/cache/               │  │
│  model-registry.json (1hr TTL)  │  │
│  Background-fetched from        │  │
│  https://models.dev/api/models  │  │
│  If hit → return + cache in T1  │  │
└─────────┬───────────────────────┘  │
          │ miss                     │
          ▼                          │
┌─────────────────────────────────┐  │
│  Tier 4: Hardcoded fallback     │  │
│  src/models/fallback.ts         │  │
│  Always available, zero network │  │
│  14 Claude + 7 Tier 1 OSS models│  │
└─────────────────────────────────┘  │
                                     │
Background: fire-and-forget fetch ───┘
from models.dev updates T3 cache
```

### Key Types

```typescript
ModelEntry {
  id: string                    // e.g. "claude-opus-4-6"
  displayName: string           // e.g. "Claude Opus 4.6"
  provider: string              // 'anthropic' | 'qwen' | 'deepseek' | etc.
  contextWindow: number         // e.g. 200_000
  maxOutputTokens: number       // e.g. 128_000
  capabilities?: {
    supportsThinking: boolean
    supportsEffort: boolean
    supportsImages: boolean
    supportsPdfs: boolean
    supportsPromptCaching: boolean
    supports1mContext: boolean
  }
  providerMapping?: {
    firstParty?: string
    bedrock?: string
    vertex?: string
    foundry?: string
    openai?: string
  }
  pricing?: object
  aliases?: string[]
  matchPattern?: string         // regex for OpenAI-compatible models
}
```

### Public API

```typescript
getModelEntry(modelId)              → ModelEntry | undefined
getRegistryContextWindow(modelId)   → number | undefined
getRegistryMaxOutputTokens(modelId) → number | undefined
getRegistryCapabilities(modelId)    → ModelCapabilities | undefined
getCachedRegistry()                 → ModelRegistry
fetchModelRegistry(url?)            → Promise<ModelRegistry>
loadLocalRegistry()                 → ModelRegistry | null
```

### Supported Models (Fallback Registry)

**Claude Models** (with cross-provider mappings):
- Claude 3.5 Haiku / Sonnet V2 (200K context)
- Claude 3.7 Sonnet (200K, 64K output)
- Claude Haiku 4.5, Sonnet 4/4.5/4.6, Opus 4/4.1/4.5/4.6
- Up to 1M context with beta flag

**Tier 1 OpenAI-Compatible Models**:
- Qwen3-Coder-480B / Qwen3-Coder-Next (262K context)
- DeepSeek-V3 (131K) / DeepSeek-R1 (163K)
- GLM-4.7 (131K)
- Gemma-4-31B (262K) / Gemma-4-26B MoE (131K)

---

## Session Persistence

### Transcript Storage

```
src/utils/sessionStorage.ts

- recordTranscript()       — Append messages to session JSONL file
- saveCurrentSessionCosts() — Persist cost data
- restoreSessionMetadata() — Load previous state on resume

Format: JSONL (one message per line)
Location: ~/.claude/sessions/<session-id>/
```

### Cost Tracking

```
src/cost-tracker.ts

Tracks per-session:
- Input tokens used
- Output tokens used
- Cost in USD
- Per-model breakdowns
Updates on message completion (from API response headers)
```

### Message Logging

```
src/hooks/useLogMessages.ts

Async persistence of messages to disk.
Batches writes to reduce I/O overhead.
```

---

## Feature Flags

The application uses 88 compile-time `feature('FLAG')` checks for dead-code elimination.

### Build Variants

| Command | Output | Description |
|---|---|---|
| `bun run build` | `./cli` | Regular external binary |
| `bun run build:dev` | `./cli-dev` | Dev build with experimental GrowthBook key |
| `bun run build:dev:full` | `./cli-dev` | All working experimental features enabled |
| `bun run compile` | `./dist/cli` | Compiled binary |

### Flag Categories

- **54 flags** bundle cleanly in current snapshot
- **34 flags** fail to bundle (missing dependencies or subsystems)

See `FEATURES.md` for the complete audit of all 88 flags with descriptions,
runtime caveats, and reconstruction paths for broken flags.

### Key Working Flags

| Flag | Feature |
|---|---|
| `VOICE_MODE` | Voice input/dictation (default-on) |
| `BRIDGE_MODE` | Remote control sessions |
| `TOKEN_BUDGET` | Token budget tracking and warnings |
| `ULTRAPLAN` | Deep planning mode |
| `ULTRATHINK` | Extra thinking depth |
| `KAIROS_BRIEF` | Brief transcript layout |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | Explore/Plan agent presets |
| `AGENT_TRIGGERS` | Local cron/trigger tools |
| `EXTRACT_MEMORIES` | Post-query memory extraction |
| `MESSAGE_ACTIONS` | Message action UI |

---

## Appendix: File Map

### Core Application

| Path | Purpose |
|---|---|
| `src/entrypoints/cli.tsx` | CLI bootstrap and flag parsing |
| `src/entrypoints/cli-solid.tsx` | OpenTUI entry point |
| `src/main.tsx` | Application initialization and renderer selection |
| `src/screens/REPL.tsx` | Main interactive prompt loop |
| `src/query.ts` | Core query loop (provider-agnostic) |
| `src/query/deps.ts` | Dependency injection factory |
| `src/commands.ts` | Command registry and loading |
| `src/Tool.ts` | Base tool interface |
| `src/tools.ts` | Tool registry |

### API & Providers

| Path | Purpose |
|---|---|
| `src/services/api/claude.ts` | Anthropic API streaming |
| `src/services/api/client.ts` | Anthropic SDK client creation |
| `src/services/api/openai/queryOpenAI.ts` | OpenAI-compatible streaming |
| `src/services/api/openai/messageTranslation.ts` | Format conversion |
| `src/services/api/openai/modelRegistry.ts` | Tier 1 model capabilities |
| `src/services/api/converters/` | Internal ↔ SDK type converters |
| `src/services/api/withRetry.ts` | Retry logic |
| `src/services/api/errorUtils.ts` | Error handling |

### Model Registry

| Path | Purpose |
|---|---|
| `src/models/registry.ts` | Layered registry with caching |
| `src/models/types.ts` | Zod schemas and types |
| `src/models/fallback.ts` | Hardcoded fallback data |

### UI Layer

| Path | Purpose |
|---|---|
| `src/ui/solid/` | OpenTUI + SolidJS components (272 files) |
| `src/ui/solid/render.ts` | OpenTUI render adapter |
| `src/ui/solid/hooks.ts` | Hook adapters |
| `src/components/` | React + Ink components (legacy) |
| `src/ink/` | Custom Ink fork (~20K lines) |

### Tool Execution

| Path | Purpose |
|---|---|
| `src/services/tools/toolOrchestration.ts` | Concurrent tool execution |
| `src/services/tools/toolExecution.ts` | Single tool execution |
| `src/services/tools/StreamingToolExecutor.ts` | During-stream execution |
| `src/tools/` | 40+ tool implementations |

### Context & Compaction

| Path | Purpose |
|---|---|
| `src/services/compact/autoCompact.ts` | Auto-compaction |
| `src/services/compact/microCompact.ts` | Per-message summarization |
| `src/services/compact/snipCompact.ts` | Surgical detail removal |

### Bridge

| Path | Purpose |
|---|---|
| `src/bridge/replBridge.ts` | Main bridge interface |
| `src/bridge/replBridgeTransport.ts` | REST + WebSocket transport |
| `src/bridge/bridgeMessaging.ts` | Message format conversion |

### Configuration

| Path | Purpose |
|---|---|
| `src/constants/prompts.ts` | System prompts |
| `src/constants/system.ts` | System constants |
| `src/constants/betas.ts` | Beta header definitions |
| `src/constants/oauth.ts` | OAuth configuration |
| `src/utils/model/` | Model config, providers, capabilities |
| `src/utils/auth.ts` | Authentication logic |
| `src/utils/hooks.ts` | Hook execution engine |
