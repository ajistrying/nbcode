# REPL.tsx and QueryEngine.ts: Architecture Deep-Dive

> Source files: `free-code/src/screens/REPL.tsx` and `free-code/src/QueryEngine.ts`

---

## Overview

These two files represent the two execution paths for the Claude Code conversation loop:

| File | Role | Used By |
|---|---|---|
| **REPL.tsx** | Interactive terminal UI — renders the conversation, handles user input, manages permissions, streaming, and visual state | CLI terminal sessions (the main user-facing experience) |
| **QueryEngine.ts** | Headless/SDK conversation engine — manages the query lifecycle without any UI | SDK consumers, headless mode (`-p` flag), programmatic API, desktop app backend |

Both ultimately call the same `query()` function from `src/query.ts`, which is the actual API-calling loop. The difference is in how they **set up context**, **handle user input**, **manage state**, and **present results**.

---

## REPL.tsx — The Interactive Terminal UI

### Component Signature

```typescript
export function REPL({
  commands, debug, initialTools, initialMessages,
  pendingHookMessages, initialFileHistorySnapshots,
  mcpClients, dynamicMcpConfig, systemPrompt,
  appendSystemPrompt, onBeforeQuery, onTurnComplete,
  disabled, mainThreadAgentDefinition, disableSlashCommands,
  remoteSessionConfig, directConnectConfig, sshSession,
  thinkingConfig,
  ...
}: Props): React.ReactNode
```

REPL is a massive (~5000 line) React component rendered via Ink (React for the terminal). It is the root screen for interactive Claude Code sessions.

### Key Responsibilities

#### 1. State Management

REPL manages dozens of state variables via `useState`, `useRef`, and the centralized `AppState` store:

- **Messages array** (`messages` / `messagesRef`) — The conversation history. Updated synchronously via a ref mirror to avoid React batching delays during streaming.
- **Loading state** — Driven by `QueryGuard`, a synchronous state machine that prevents concurrent queries. `isLoading = isQueryActive || isExternalLoading`.
- **Tool permission state** — `toolPermissionContext` from AppState, tracks what tools are allowed/denied.
- **Streaming state** — `streamMode`, `streamingToolUses`, `streamingThinking`, `streamingText` for real-time display of Claude's response.
- **Abort controller** — Each query gets its own `AbortController` for cancellation (Ctrl+C / Esc).
- **UI state** — Screen mode (prompt vs transcript), tool JSX overlays, dialogs, notifications, companion sprite, etc.

#### 2. The Query Lifecycle (Submit → Response)

The flow from user keystroke to rendered response involves three key callbacks:

##### `onSubmit` (line ~3145)
Entry point when the user presses Enter. Handles:
- **Immediate commands** (e.g., `/btw`, `/config`) — Execute locally without queuing, even while Claude is processing.
- **History management** — Adds input to shell history, manages stashed prompts.
- **Idle detection** — Checks if the user has been away too long and prompts to start fresh.
- **Speculation acceptance** — Handles pre-computed responses from the speculation engine.
- **Remote mode** — Routes input via WebSocket instead of local query.
- **Input clearing** — Resets the prompt input, sets placeholder text.
- **Delegates to `handlePromptSubmit`** — Which processes the input (slash commands, bash mode, text attachments, image attachments) and eventually calls `onQuery`.

##### `onQuery` (line ~2858)
The query dispatcher. Handles:
- **Concurrent query guard** — Uses `queryGuard.tryStart()` to atomically prevent concurrent queries. If one is already running, enqueues the input for later.
- **Message appending** — Adds new messages to the conversation via `setMessages`.
- **Token budget** — Snapshots output token budgets for budget-constrained turns.
- **Delegates to `onQueryImpl`** — The actual query executor.
- **Cleanup (finally block)** — Resets loading state, notifies bridge clients, adds turn duration messages, handles auto-restore on interrupt (if user cancels before meaningful response).

##### `onQueryImpl` (line ~2664)
The core query loop. This is where the API call happens:
- **IDE integration** — Closes open diffs, notifies diagnostic tracker.
- **Session title generation** — Uses Haiku to generate a title from the first user message.
- **System prompt assembly** — Fetches `getSystemPrompt`, `getUserContext`, `getSystemContext`, builds the effective system prompt.
- **Calls `query()`** — The shared query function that talks to the Claude API.
- **Processes events** — Each event from `query()` is passed to `onQueryEvent`, which dispatches to `handleMessageFromStream` to update streaming state, messages, tool uses, etc.
- **Metrics** — Computes TTFT, OTPS, hook/tool duration metrics.

#### 3. Event Processing (`onQueryEvent` / `handleMessageFromStream`)

`handleMessageFromStream` (line ~2587 via `onQueryEvent`) processes each yielded event from `query()`:

- **`assistant` messages** — Updates messages array, extracts streaming text for display.
- **`user` messages** — Tool results, appended to conversation.
- **`stream_event`** — Raw SSE events for streaming display (thinking blocks, content deltas, tool use starts/stops).
- **`progress` messages** — Hook execution progress.
- **`system` messages** — Compact boundaries, API errors/retries.
- **`attachment` messages** — Memory attachments, structured output, max-turns signals.
- **`tool_use_summary`** — Summaries of tool executions.

#### 4. UI Rendering

The render output has two main modes:

- **Transcript mode** (`screen === 'transcript'`) — Read-only scrollable view of the full conversation with search (less-style `/`, `n`/`N`).
- **Normal mode** — The active conversation view with:
  - `<Messages>` — Renders the conversation messages.
  - `<SpinnerWithVerb>` — Shows loading state with elapsed time, TTFT, mode indicator.
  - `<PromptInput>` — The text input area.
  - `<PermissionRequest>` — Tool permission dialogs.
  - `<TaskListV2>` — Expanded todo view.
  - Various overlays: `<CostThresholdDialog>`, `<IdleReturnDialog>`, `<ElicitationDialog>`, `<FeedbackSurvey>`, `<SandboxPermissionRequest>`, etc.

Everything is wrapped in `<AlternateScreen>` (when fullscreen) → `<KeybindingSetup>` → `<FullscreenLayout>` which manages the ScrollBox-based virtual scrolling.

#### 5. Notable Sub-systems

- **Swarm/Teammates** — REPL manages teammate lifecycle, viewing agent transcripts, forwarding permissions between leader and worker agents.
- **Command Queue** — When a query is in progress, new submissions are enqueued and processed sequentially.
- **MCP (Model Context Protocol)** — Dynamic MCP server connections, tool merging, elicitation handling.
- **File History** — Snapshots file state at each user message for undo/rewind.
- **Remote/Direct Connect/SSH** — Alternative execution backends that bypass local query.
- **Proactive/Loop Mode** — Autonomous ticking that submits prompts on a schedule.

---

## QueryEngine.ts — The Headless Conversation Engine

### Class Structure

```typescript
export class QueryEngine {
  private config: QueryEngineConfig
  private mutableMessages: Message[]
  private abortController: AbortController
  private permissionDenials: SDKPermissionDenial[]
  private totalUsage: NonNullableUsage
  private readFileState: FileStateCache
  private discoveredSkillNames: Set<string>
  private loadedNestedMemoryPaths: Set<string>
}
```

QueryEngine is a **stateful class** — one instance per conversation. It holds the message history, usage tracking, file cache, and abort controller across multiple `submitMessage()` calls.

### `QueryEngineConfig`

The config object wires QueryEngine to its environment:

```typescript
type QueryEngineConfig = {
  cwd: string                    // Working directory
  tools: Tools                   // Available tools
  commands: Command[]            // Slash commands
  mcpClients: MCPServerConnection[]  // MCP servers
  agents: AgentDefinition[]      // Agent definitions
  canUseTool: CanUseToolFn       // Permission function
  getAppState: () => AppState    // State reader
  setAppState: (f) => void       // State writer
  initialMessages?: Message[]    // Pre-existing conversation
  readFileCache: FileStateCache  // File content cache
  customSystemPrompt?: string    // Override system prompt
  appendSystemPrompt?: string    // Append to system prompt
  userSpecifiedModel?: string    // Model override
  thinkingConfig?: ThinkingConfig
  maxTurns?: number              // Turn limit
  maxBudgetUsd?: number          // Cost limit
  jsonSchema?: Record<string, unknown>  // Structured output schema
  // ...more options
}
```

### `submitMessage()` — The Core Method

```typescript
async *submitMessage(
  prompt: string | ContentBlockParam[],
  options?: { uuid?: string; isMeta?: boolean }
): AsyncGenerator<SDKMessage, void, unknown>
```

This is an **async generator** that yields SDK-compatible messages as the conversation progresses. The flow:

#### Phase 1: Setup (lines 209–395)
1. Destructures config into local variables.
2. Wraps `canUseTool` to track permission denials.
3. Fetches system prompt parts (`fetchSystemPromptParts`).
4. Builds the full system prompt (default + custom + memory mechanics + append).
5. Registers structured output enforcement if JSON schema is provided.
6. Creates `ProcessUserInputContext` — a context object that slash commands and input processing use.

#### Phase 2: Input Processing (lines 410–463)
1. Calls `processUserInput()` to handle the prompt — expands slash commands, creates user messages, determines if an API query is needed.
2. Pushes new messages to `mutableMessages`.
3. Persists the user message to transcript (for `--resume` support).

#### Phase 3: Local Command Handling (lines 556–638)
If `shouldQuery === false` (local slash command), yields the command output as SDK messages and returns a success result without calling the API.

#### Phase 4: The Query Loop (lines 675–1048)
The core API interaction:

```typescript
for await (const message of query({
  messages,
  systemPrompt,
  userContext,
  systemContext,
  canUseTool: wrappedCanUseTool,
  toolUseContext: processUserInputContext,
  fallbackModel,
  querySource: 'sdk',
  maxTurns,
  taskBudget,
})) {
  // Process each yielded message...
}
```

Each message type is handled:
- **`assistant`** — Pushed to mutableMessages, yielded as normalized SDK messages (text blocks, tool use blocks, thinking blocks).
- **`user`** — Tool results, pushed and yielded.
- **`progress`** — Hook progress, pushed and yielded.
- **`stream_event`** — Usage tracking (message_start/delta/stop), optionally forwarded if `includePartialMessages` is true.
- **`attachment`** — Structured output capture, max-turns enforcement, queued commands.
- **`system`** — Compact boundaries (memory management), API retries, snip replay.
- **`tool_use_summary`** — Yielded to SDK consumers.

#### Phase 5: Budget/Limit Checks (lines 971–1048)
After each message, checks:
- USD budget exceeded → yields `error_max_budget_usd` result.
- Structured output retry limit exceeded → yields `error_max_structured_output_retries` result.

#### Phase 6: Result (lines 1058–1156)
- Finds the last assistant/user message.
- Checks `isResultSuccessful()` — if not, yields `error_during_execution`.
- Extracts text result from the last assistant message.
- Yields final `success` result with cost, usage, duration, permission denials, and structured output.

### Convenience Wrapper: `ask()`

```typescript
export async function* ask({ prompt, tools, ... }): AsyncGenerator<SDKMessage>
```

A one-shot wrapper that creates a `QueryEngine`, calls `submitMessage()` once, and yields all results. Used by the `-p` (print) mode for single-prompt execution.

### Additional Methods

- `interrupt()` — Aborts the current query via the abort controller.
- `getMessages()` — Returns the conversation history.
- `getReadFileState()` — Returns the file content cache.
- `setModel(model)` — Changes the model for subsequent turns.

---

## How They Work Together

### The Shared Foundation: `query()`

Both REPL and QueryEngine call the same `query()` function from `src/query.ts`:

```
User Input
    │
    ├─── REPL Path ──────────────────────────────────────────────┐
    │    onSubmit → handlePromptSubmit → processUserInput         │
    │    → onQuery → onQueryImpl → query()                       │
    │                                                             │
    ├─── QueryEngine Path ───────────────────────────────────────┐│
    │    submitMessage → processUserInput → query()              ││
    │                                                            ││
    └────────────────────────────────────────────────────────────┘│
                                                                  │
                        ┌─────────────────────────────────────────┘
                        ▼
                   query() [src/query.ts]
                        │
                        ▼
                   queryLoop()
                        │
                        ├── Build system prompt + user context
                        ├── Call Claude API (streaming)
                        ├── Process tool use → execute tools
                        ├── Feed tool results back
                        ├── Auto-compact if needed
                        └── Yield messages back to caller
```

### Key Differences

| Aspect | REPL | QueryEngine |
|---|---|---|
| **State management** | React useState/useRef + AppState store | Plain class fields |
| **Message updates** | `setMessages()` with React batching, ref mirror for sync reads | Direct `mutableMessages.push()` |
| **Permission handling** | Interactive `<PermissionRequest>` dialog with keyboard input | `canUseTool` callback (caller decides) |
| **Streaming display** | `handleMessageFromStream` updates spinner, streaming text, tool uses | Yields `stream_event` messages to consumer |
| **Concurrency** | `QueryGuard` state machine prevents concurrent queries, with enqueue | Single-threaded — one `submitMessage()` at a time |
| **Session persistence** | Full: transcript recording, session restore, resume support | Conditional: respects `isSessionPersistenceDisabled()` |
| **UI** | Full Ink-based terminal UI with scrolling, search, notifications | None — pure async generator |
| **Error recovery** | Auto-restore on interrupt, message selector for rewind | Yields error result messages |

### Shared Infrastructure

Both paths share:
- **`processUserInput()`** — Handles slash commands, bash mode, text/image attachments, content block creation.
- **`query()` / `queryLoop()`** — The API interaction loop with tool execution, auto-compaction, retry logic.
- **`AppState`** — Both read/write the same state store (tools, permissions, file history, etc.).
- **`recordTranscript()`** — Session persistence for `--resume`.
- **`getSystemPrompt()` / `getUserContext()` / `getSystemContext()`** — System prompt construction.
- **`canUseTool`** — Permission checking (REPL provides an interactive implementation, SDK callers provide their own).

### Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         REPL.tsx                                 │
│                                                                  │
│  PromptInput ──onSubmit──→ handlePromptSubmit                    │
│       │                        │                                 │
│       │                   processUserInput()                     │
│       │                        │                                 │
│       │                   onQuery()                              │
│       │                   ├─ queryGuard.tryStart()               │
│       │                   ├─ setMessages([...old, ...new])       │
│       │                   └─ onQueryImpl()                       │
│       │                       ├─ getSystemPrompt()               │
│       │                       ├─ buildEffectiveSystemPrompt()    │
│       │                       └─ for await (query(...))          │
│       │                            └─ onQueryEvent()             │
│       │                                └─ handleMessageFromStream│
│       │                                    ├─ setMessages()      │
│       │                                    ├─ setStreamMode()    │
│       │                                    ├─ setStreamingText() │
│       │                                    └─ setToolUseConfirm()│
│       │                                                          │
│  Messages ◄── displayedMessages ◄── messages/deferredMessages    │
│  SpinnerWithVerb ◄── isLoading, streamMode                       │
│  PermissionRequest ◄── toolUseConfirmQueue                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      QueryEngine.ts                              │
│                                                                  │
│  submitMessage(prompt)                                           │
│       │                                                          │
│       ├─ fetchSystemPromptParts()                                │
│       ├─ processUserInput()                                      │
│       ├─ mutableMessages.push(...newMessages)                    │
│       ├─ recordTranscript()                                      │
│       │                                                          │
│       └─ for await (query({messages, systemPrompt, ...}))        │
│            │                                                     │
│            ├─ assistant → mutableMessages.push(), yield* normalize│
│            ├─ user      → mutableMessages.push(), yield* normalize│
│            ├─ stream_event → track usage, optionally yield        │
│            ├─ system    → compact boundary handling, yield        │
│            ├─ attachment → structured output, max-turns check     │
│            └─ progress  → yield                                  │
│                                                                  │
│       └─ yield { type: 'result', ... }                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Takeaways

1. **REPL is the UI shell; QueryEngine is the headless equivalent.** They solve the same problem (drive a Claude conversation) with different interfaces.

2. **`query()` is the real engine.** Both REPL and QueryEngine are consumers of the same `query()` async generator, which handles the actual API calls, tool execution, compaction, and retry logic.

3. **REPL is React-based** (via Ink). All UI state follows React patterns — `useState`, `useCallback`, `useMemo`, `useRef`, `useSyncExternalStore`. The `QueryGuard` is the notable exception: a synchronous state machine to prevent race conditions that React's async batching can't handle.

4. **QueryEngine is a thin stateful wrapper.** Its main job is to build the right context objects and pipe `query()` results into SDK-compatible message types.

5. **Permission handling is the biggest divergence.** REPL renders interactive dialogs; QueryEngine wraps `canUseTool` to track denials and lets the SDK caller decide policy.

6. **The message flow is: user input → `processUserInput()` → `query()` → streamed events → message array updates.** Both paths follow this pattern; they just differ in how events are consumed (React state updates vs. async generator yields).
