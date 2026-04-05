# Noble Base Code: Modernization Task Tracker

> Derived from: [opencode-modernization-plan.md](./opencode-modernization-plan.md)
> Status key: `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked, `[-]` skipped

---

## Phase 1: Provider Abstraction (Revised after audit)
**Goal**: Replace OpenAI-compatible provider with AI SDK (~1300 lines deleted). Keep Anthropic SDK for first-party/Bedrock/Vertex/Foundry due to 11 P0 blockers (beta headers, prompt caching, effort, etc.). See `docs/phase1-provider-audit.md` for full analysis.

### Sub-phase 1A: OpenAI-compatible migration (lowest risk, highest payoff)
- [x] **1.1** Deep audit of all provider/streaming/tool-calling surfaces (see `docs/phase1-provider-audit.md`)
- [x] **1.2** Install `ai`, `@ai-sdk/openai-compatible`
- [x] **1.3** Create `src/services/api/openai/aiSdkAdapter.ts` (946 lines) — AI SDK adapter producing internal StreamEvent format
- [x] **1.4** Update `src/query/deps.ts` to use AI SDK adapter
- [x] **1.5** Delete `src/services/api/openai/queryOpenAI.ts` (~560 lines)
- [x] **1.6** Delete `src/services/api/openai/messageTranslation.ts` (~357 lines)
- [x] **1.7** Delete `src/services/api/openai/types.ts` (~62 lines)
- [x] **1.8** Delete `src/services/api/openai/config.ts` (~60 lines)
- [ ] **1.9** Test: multi-turn conversation with tool use via OpenAI-compatible provider

### Sub-phase 1B: Anthropic SDK improvements (keep SDK, improve abstraction)
- [x] **1.10** Extract `params.ts` (466 lines) — parameter building, effort, cache control, metadata
- [x] **1.11** Extract `streamHandler.ts` (154 lines) — usage tracking, stream cleanup
- [x] **1.12** Extract `errorHandler.ts` (160 lines) — non-streaming fallback
- [x] **1.13** Extract `messageConversion.ts` (364 lines) — message format conversion, cache breakpoints
- [x] **1.14** claude.ts reduced from 3,419 → 2,432 lines (29% reduction), all re-exports preserved

### Sub-phase 1C: Internal format migration — remove Anthropic SDK dependency
**Goal**: Replace all 527 Anthropic SDK type references across 124 files with provider-neutral internal types. See `docs/ai-sdk-migration-map.md` for full analysis.

#### Phase 0: Foundation
- [x] **1.14** Create `src/types/internal-messages.ts` — provider-neutral types (InternalMessage, InternalPart variants, InternalStreamPart, InternalUsage, InternalFinishReason)
- [x] **1.15** Create `src/services/api/converters/anthropic.ts` — bidirectional Anthropic SDK <-> Internal conversion
- [x] **1.16** Create `src/services/api/converters/ai-sdk.ts` — bidirectional AI SDK <-> Internal conversion
- [x] **1.17** Create `src/services/api/converters/index.ts` — barrel export
- [x] **1.18** Create `src/types/message.ts` — missing type definitions (build-time generated in Anthropic source, never existed in fork)

#### Phase 1: API Boundary
- [x] **1.19** Create `src/services/api/streamAdapter.ts` — dual-emit wrapper for Anthropic streaming (legacy + InternalStreamPart)
- [x] **1.20** Create `src/services/api/openai/streamAdapter.ts` — dual-emit wrapper for OpenAI-compatible streaming
- [x] **1.21** Update `src/query/deps.ts` — add `callModelAdapted` to QueryDeps, populate in productionDeps()
- [ ] **1.22** Update `query.ts` to consume `InternalStreamPart` via callModelAdapted
- [ ] **1.23** Update message creation in `utils/messages/create.ts` to produce internal content parts

#### Phase 2: Tool Execution Layer
- [x] **1.23** Add internal type imports + `toolUseBlockToInternalToolCall()` converter to toolExecution.ts, toolOrchestration.ts, StreamingToolExecutor.ts
- [x] **1.24** Add dual-format `createToolResult()` + convenience wrappers (text, error, denied) to toolExecution.ts
- [x] **1.25** Add `InternalToolCallPart/InternalToolResultPart/InternalToolResultOutput` re-exports to `Tool.ts`

#### Phase 3: Message Utilities
- [x] **1.26** Add `isInternalToolCallMessage()`, `isInternalToolResultMessage()` + re-exports to `utils/messages/types.ts`
- [x] **1.27** Add `InternalStreamingToolUse` type to `utils/messages/stream.ts`
- [x] **1.28** Add `getInternalToolCallParts()` to `utils/messages/lookups.ts`
- [x] **1.29** Add `internalToStorageFormat()` to `toolResultStorage.ts`

#### Phase 4: UI Layer
- [x] **1.30** Create `src/utils/toolBlockCompat.ts` — dual-format accessors (isToolCallBlock, getToolCallId, getToolName, etc.)
- [x] **1.31** Add compat imports + TODO annotations to 15 UI/tool files (10 components + 5 tool files)

#### Phase 5: Supporting Systems
- [x] **1.32** Add compat imports + TODOs to bridge modules (inboundMessages, inboundAttachments, sessionRunner)
- [x] **1.33** Add compat imports + TODOs to compact/microCompact (5 markers)
- [x] **1.34** Add compat imports + TODOs to permission classifiers (classifierShared, yoloClassifier, permissionExplainer)
- [x] **1.35** Add compat imports + TODOs to MCP client (3 markers)

#### Phase 6: Cleanup
- [x] **1.36** Create `src/services/api/converters/MIGRATION_STATUS.md` — full inventory of types, converters, TODOs
- [x] **1.37** Update converter barrel exports with complete coverage
- [x] **1.38** Final switch: resolved all 61 `TODO(ai-sdk-migration)` markers across 24 files
- [ ] **1.39** Simplify `aiSdkAdapter.ts` — remove Anthropic event synthesis layer (946 -> ~200 lines, future)

---

## Phase 9: OpenTUI + SolidJS Migration
**Goal**: Replace React+Ink TUI with OpenTUI+SolidJS for better performance and smaller code. See `docs/opentui-solidjs-migration-plan.md`.

- [x] **9.1** Install `@opentui/core`, `@opentui/solid`, configure SolidJS build
- [x] **9.2** Create adapter types and shared hook signatures
- [x] **9.3** Proof of concept: render one leaf component via OpenTUI+Solid
- [x] **9.4** Port Ink primitives to OpenTUI equivalents (15 components + 12 hooks)
- [x] **9.5** Port 156 presentational components (mechanical translation) — 120 components ported across 6 directories (7,022 lines)
- [x] **9.6** Port 121 simple stateful components (1-3 hooks) — 88 components ported across 12 directories
- [x] **9.7** Port complex components: VirtualMessageList, PromptInput, Messages, Dialogs, Settings — 58 components ported (14,680→4,979 lines, 66% reduction)
- [x] **9.8** Port REPL.tsx orchestration to SolidJS (5,002 → 1,909 lines, 62% reduction)
- [x] **9.9** Port Doctor.tsx (575 lines) and ResumeConversation.tsx (513 lines)
- [x] **9.10** Prepare Ink removal: OpenTUI entry point, render adapter, removal manifest (`docs/ink-removal-manifest.md`)
- [x] **9.11** Optimization verified: 117 createSignal, 70 createEffect, 52 createMemo, `<For>` keyed rendering, `<scrollbox>` native culling

---

## Phase 2: SQLite + Drizzle ORM for Persistence
**Goal**: Replace 5K-line file-based storage with queryable SQLite database.

- [x] **2.1** Install `drizzle-orm`, `drizzle-kit`
- [x] **2.2** Create `src/db/database.ts` — SQLite connection via Bun native (WAL mode, 64MB cache, busy_timeout=5000)
- [x] **2.3** Create `src/db/schema.ts` — Drizzle table definitions for sessions, stats, PR links, worktree, agents
- [x] **2.4** Create inline migrations (PRAGMA user_version based)
- [x] **2.5** Create `src/db/queries.ts` — full CRUD for sessions, stats, PR links, worktree state, agent metadata
- [x] **2.6** Create `src/db/sessionIndexer.ts` — write-through cache hooks for sessionStorage
- [x] **2.7** Hook indexer into sessionStorage: materializeSessionFile, saveCustomTitle, saveAiGeneratedTitle, saveTag, linkSessionToPR
- [x] **2.8** Register DB cleanup on graceful shutdown
- [x] **2.9** Session search by title/tag/prompt (SQL LIKE)
- [x] **2.10** Per-session cost/token tracking (persisted across sessions)
- [x] **2.11** Test: full CRUD, search, upsert, cost aggregation
- [x] **2.12** Create import script: backfill existing JSONL sessions into SQLite index (301 sessions, 15 projects)
- [ ] **2.13** Update `/resume` to use DB index for faster session listing
- [-] **2.14** ~~Migrate message storage to DB~~ (kept in JSONL — right tool for append-only transcripts)
- [-] **2.15** ~~Delete sessionStorage.ts~~ (kept as source of truth, SQLite is index layer)
- [ ] **2.16** Hook indexer into session stats (end of API call)
- [ ] **2.17** Test: session persistence across restarts

---

## Phase 3: Flatten Tool Interface
**Goal**: Simplify 189-file tool system to clean Zod-in/string-out pattern.

- [ ] **3.1** Design and implement `src/tools/framework.ts` — `ToolDefinition` interface, `ToolContext`, `ToolResult` types
- [ ] **3.2** Implement auto-truncation wrapper (save full output to temp file, return truncated version)
- [ ] **3.3** Extract centralized permission evaluation from individual tools into `src/tools/permissions.ts`
- [ ] **3.4** Create `src/tools/renderer.ts` — generic tool result rendering (replaces per-tool UI components)
- [ ] **3.5** Migrate `glob` tool to new interface (simplest, good test case)
- [ ] **3.6** Migrate `grep` tool to new interface
- [ ] **3.7** Migrate `read` (FileRead) tool to new interface
- [ ] **3.8** Migrate `write` (FileWrite) tool to new interface
- [ ] **3.9** Migrate `edit` (FileEdit) tool to new interface
- [ ] **3.10** Migrate `ls` tool to new interface
- [ ] **3.11** Migrate `webfetch` tool to new interface
- [ ] **3.12** Migrate `websearch` tool to new interface
- [ ] **3.13** Consolidate BashTool: merge 18 files into `bash.ts`, `bash-security.ts`, `bash-permissions.ts`, `bash-shell.ts`
- [ ] **3.14** Migrate `bash` tool to new interface
- [ ] **3.15** Implement persistent shell session for bash tool (single shell process, env/cwd persists across invocations)
- [ ] **3.16** Migrate `agent` tool to new interface
- [ ] **3.17** Migrate `task` tools (create, get, list, update) to new interface
- [ ] **3.18** Migrate `skill` tool to new interface
- [ ] **3.19** Migrate remaining tools (LSP, notebook, worktree, etc.)
- [ ] **3.20** Delete old tool subdirectories and supporting files
- [ ] **3.21** Update tool registry (`src/tools.ts`) for new interface
- [ ] **3.22** Test: all tools work in multi-turn conversation with tool-use loop

---

## Phase 4: Shadow Git Snapshots for Undo
**Goal**: Every file change is undoable. Shadow git repo tracks all modifications.

- [x] **4.1** Create `src/snapshots/snapshot.ts` — init shadow repo, take/list/revert snapshots
- [x] **4.2** Create `src/snapshots/toolHook.ts` — detect file-modifying tools, extract affected files
- [x] **4.3** Hook into tool execution: take pre-snapshot before file-modifying tools (write, edit, bash, patch)
- [x] **4.4** Implement snapshot storage in `.nbcode/snapshots/` with shadow git repo
- [x] **4.5** Add `/undo` command — revert last snapshot
- [x] **4.6** Add `/undo N` — revert N steps back
- [x] **4.7** Add `/snapshots` command — list available snapshots with timestamps and file lists
- [x] **4.8** Implement snapshot pruning (delete snapshots older than 7 days)
- [x] **4.9** Add max file size check (skip files >2MB)
- [x] **4.10** Test: undo after edit, undo after bash, undo after multi-file change, new file deletion

---

## Phase 5: External Model Registry
**Goal**: Model metadata is externalized. New models available without code changes.

- [x] **5.1** Define model metadata schema in Zod (`src/models/types.ts`): id, provider, context window, max output, pricing, capabilities, aliases
- [x] **5.2** Create `src/models/registry.ts` — layered cache (memory 5min → local file → remote disk 1hr → fallback), background fetch, O(1) lookups
- [x] **5.3** Create `src/models/fallback.ts` — 11 Claude models + 7 Tier 1 OpenAI-compatible models (18 total)
- [x] **5.4** Support local overrides via `~/.claude/models.json`
- [x] **5.5** Barrel export `src/models/index.ts`
- [x] **5.6** Wire `context.ts` getContextWindowForModel() + getMaxOutputTokensForModel() to use registry as fallback
- [x] **5.7** Wire `modelRegistry.ts` getTier1Capabilities() + getSupportedModelPatterns() to use registry
- [x] **5.8** Build passes, new models work via ~/.claude/models.json without code changes

---

## Phase 6: LSP Auto-Detection
**Goal**: Agent has access to real compiler diagnostics via auto-spawned language servers.

- [x] **6.1** Create `src/lsp/servers.ts` — 12 language server configs (TS, Python, Go, Rust, C/C++, Java, Ruby, PHP, C#, Swift, Kotlin, Zig)
- [x] **6.2** Create `src/lsp/detector.ts` — 50+ file extensions mapped to 25+ languages
- [x] **6.3** Create `src/lsp/client.ts` — standalone JSON-RPC client (initialize, didOpen, didChange, diagnostics, shutdown)
- [x] **6.4** Create `src/lsp/launcher.ts` — auto-spawn, root detection, max 3 concurrent servers with LRU eviction, crash recovery
- [x] **6.5** Create `src/lsp/index.ts` — public API: `notifyFileAccessed()`, `getFileDiagnostics()`, `shutdownAll()`
- [x] **6.6** Root directory detection (walks up to find package.json, go.mod, Cargo.toml, etc.)
- [x] **6.7** `registerCustomServer()` API for user-defined LSP server configs
- [x] **6.8** Graceful shutdown via cleanupRegistry
- [x] **6.9** Hook `notifyFileAccessed()` into file read/edit tools (fire-and-forget in toolExecution.ts)
- [x] **6.10** Create `/diagnostics` command (aliases: `/diag`) with per-file and session-wide views
- [ ] **6.11** Test: TypeScript diagnostics end-to-end

---

## Phase 7: Event-Based State Architecture
**Goal**: Decouple business logic from UI. All state changes flow through typed events.

- [x] **7.1** Design event types (`src/events/types.ts`): 19 core + 6 streaming event types (25 total)
- [x] **7.2** Implement typed event bus (`src/events/bus.ts`) — subscribe, publish, unsubscribe, with TypeScript generics
- [x] **7.3** Extract tool confirmation logic into `src/services/permissions/permissionHandler.ts` (pure queue ops)
- [x] **7.4** Extract message streaming into `src/services/messages/streamHandler.ts` (pure state-in/state-out)
- [x] **7.5** Extract session management into `src/services/sessions/sessionHandler.ts` (transcript merge, baseline tracking, placeholder logic)
- [x] **7.6** Extract keyboard handling into `src/services/keybindings/keyHandler.ts` (submit classification, slash commands, idle return, history gates)
- [x] **7.7** Wire REPL.tsx to call extracted handlers: `parseSlashCommand`, `dequeueHead`, `shouldShowPlaceholder` (net -7 lines)
- [ ] **7.8** Make permission flow fully event-driven: tool emits request → UI subscribes → UI emits response → tool resolves
- [ ] **7.9** Verify TUI still works correctly after extraction
- [ ] **7.10** Test: run business logic without Ink renderer (headless mode), verify all events fire correctly

---

## Phase 8: Consolidate Directory Structure
**Goal**: No file over 1,000 lines. Clear domain organization. New developer understands structure in 30 minutes.

- [ ] **8.1** Reorganize `src/utils/` — move domain-specific files to their domains, keep only generic utilities
- [ ] **8.2** Create domain directories: `src/filesystem/`, `src/git/`, `src/auth/`, `src/formatting/`, `src/config/`
- [ ] **8.3** Split `src/utils/messages.ts` (5,512 lines) into `src/messages/create.ts`, `normalize.ts`, `format.ts`, `types.ts`
- [ ] **8.4** Split `src/cli/print.ts` (5,594 lines) into `src/rendering/messages.ts`, `tools.ts`, `markdown.ts`, `diff.ts`
- [ ] **8.5** Split `src/screens/REPL.tsx` (5,009 lines) into core REPL, dialogs, keyboard, messages sub-components
- [ ] **8.6** Consolidate tool execution: merge `StreamingToolExecutor.ts` + `toolOrchestration.ts` + `toolExecution.ts` + `toolHooks.ts` into `src/tools/executor.ts` + `src/tools/hooks.ts`
- [ ] **8.7** Update all import paths (use barrel exports for transition)
- [ ] **8.8** Verify no circular dependencies
- [ ] **8.9** Run full test suite, fix any breakage
- [ ] **8.10** Update `docs/ARCHITECTURE.md` to reflect new structure
- [ ] **8.11** Final audit: no file >1,000 lines, `src/utils/` <30 files, clear module boundaries

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1. Provider Abstraction (1A+1B) | 14 | 14 | Complete |
| 1C. AI SDK Internal Migration | 23 | 22 | **Complete** (1 optional: aiSdkAdapter simplification) |
| 2. SQLite Persistence | 17 | 11 | Core complete, backfill + resume pending |
| 3. Tool Interface | 22 | 18 | Framework + permissions + renderer built, BashTool/AgentTool/13 other tools consolidated |
| 4. Snapshots/Undo | 10 | 10 | Complete |
| 5. Model Registry | 8 | 8 | Complete |
| 6. LSP Auto-Detection | 11 | 10 | Complete (E2E test remaining) |
| 7. Event Architecture | 10 | 7 | Event bus + 25 events + 4 handlers + REPL wired |
| 8. Directory Reorg | 11 | 4 | messages.ts split (5.5K→4K), print.ts split, REPL.tsx too risky |
| 9. OpenTUI + SolidJS | 11 | 11 | **Complete** — 272 files / 39,044 lines ported, Ink removal ready |
| **Total** | **138** | **77** | |

---

## Parallel Execution Plan (Updated)

```
Current Sprint (in progress):
  ├── Phase 1C: AI SDK Internal Format Migration (active)
  │     └── Phase 0 complete, Phase 1 (API boundary) next
  ├── Phase 7: Event Architecture + REPL extraction (critical prep for Phase 9)
  └── Phase 2.16: Session stats hookup (minor)

Next Sprint:
  ├── Phase 1C Phases 2-6: Tool layer + messages + UI + cleanup
  └── Phase 7.3-7.8: REPL business logic extraction

Final Sprint:
  ├── Phase 9: OpenTUI + SolidJS migration (18 weeks estimated)
  └── Phase 8: Directory reorg (integrate with Phase 9 cleanup)

Completed:
  ├── Phase 1A+1B: Provider Abstraction (complete)
  ├── Phase 2: SQLite Persistence (core complete)
  ├── Phase 3: Tool Interface (18/22 tasks)
  ├── Phase 4: Snapshots/Undo (complete)
  ├── Phase 5: Model Registry (complete)
  └── Phase 6: LSP Auto-Detection (10/11, E2E test remaining)
  └── Phase 8: Directory Reorg
```

---

## Notes

- Each phase should end with a working, testable state — no half-migrations
- Maintain backward compatibility during transitions (old and new can coexist)
- Commit after each completed task, not after each phase
- If a task reveals the plan is wrong, update this document before continuing
