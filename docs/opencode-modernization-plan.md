# Noble Base Code: OpenCode-Inspired Modernization Plan

> Reference: https://github.com/anomalyco/opencode (137K stars, TypeScript, MIT)
> Goal: Borrow the best architectural patterns from OpenCode to make this codebase simpler, faster, more reliable, and easier to work in without an agent.

---

## Phase 1: Vercel AI SDK Provider Abstraction

**Current state**: 16 files in `src/utils/model/` (model.ts, modelOptions.ts, providers.ts, bedrock.ts, configs.ts, aliases.ts, deprecation.ts, etc.) plus custom API clients in `src/services/api/claude.ts` and `src/services/api/openai/`. Manual streaming, manual tool-call protocol handling per provider.

**Target state**: Single provider layer using `ai` (Vercel AI SDK v6) with `@ai-sdk/*` adapters. Provider-specific code reduced to configuration, not implementation.

### What changes
- Install `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/google-vertex`, `@ai-sdk/azure`, `@ai-sdk/openai-compatible`
- Create `src/providers/` directory with:
  - `provider.ts` — thin wrapper around AI SDK's `streamText()` / `generateText()`
  - `registry.ts` — maps provider IDs to `@ai-sdk/*` instances
  - `models.ts` — model metadata (context limits, capabilities, pricing)
- Migrate `src/services/api/claude.ts` to use `@ai-sdk/anthropic`
- Migrate `src/services/api/openai/` to use `@ai-sdk/openai-compatible`
- Migrate Bedrock/Vertex/Foundry to their `@ai-sdk/*` equivalents
- Update `src/query.ts` and `src/QueryEngine.ts` to use AI SDK streaming
- Delete `src/utils/model/providers.ts`, `src/utils/model/bedrock.ts`, and other provider-specific files

### Risks
- AI SDK may not support all Anthropic-specific features (extended thinking, prompt caching, betas)
- Need to verify tool-use protocol compatibility across providers
- Streaming event format differences may require adapter layer

### Dependencies
- None (can be done first)

### Files affected
- `src/services/api/claude.ts` (rewrite)
- `src/services/api/openai/` (delete, replace)
- `src/utils/model/` (16 files — most deleted or simplified)
- `src/query.ts` (streaming logic rewrite)
- `src/QueryEngine.ts` (streaming logic rewrite)
- `src/utils/betas.ts` (may need adapter)
- `src/utils/thinking.ts` (may need adapter)

---

## Phase 2: SQLite + Drizzle ORM for Persistence

**Current state**: `src/utils/sessionStorage.ts` (5,105 lines) handles all persistence via file-based JSON storage. Sessions, messages, transcripts all managed in one monolithic file.

**Target state**: SQLite database (Bun built-in) with Drizzle ORM for type-safe queries. Clean schema with migrations.

### What changes
- Install `drizzle-orm`, `drizzle-kit`
- Create `src/db/` directory with:
  - `database.ts` — SQLite connection (Bun native, WAL mode, 64MB cache)
  - `schema.ts` — Drizzle table definitions (sessions, messages, parts, files, permissions)
  - `migrations/` — SQL migration files
  - `queries/` — type-safe query functions
- Migrate session CRUD from `sessionStorage.ts` to DB queries
- Migrate message storage from file-based to DB
- Migrate transcript recording to DB
- Add DB-backed session search/filtering
- Delete bulk of `sessionStorage.ts` (keep only thin adapter during transition)

### Schema design (borrowing from OpenCode)
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  summary TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  data TEXT NOT NULL, -- JSON blob
  created_at INTEGER NOT NULL
);

CREATE TABLE parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL, -- 'text' | 'tool_call' | 'tool_result' | 'file' | 'thinking'
  data TEXT NOT NULL, -- JSON blob
  created_at INTEGER NOT NULL
);
```

### Risks
- Migration of existing sessions (need import script)
- Bun's SQLite API stability
- Concurrent access patterns (WAL mode should handle it)

### Dependencies
- None (can parallel with Phase 1)

---

## Phase 3: Flatten Tool Interface

**Current state**: 189 files across `src/tools/` with deep subdirectories. Each tool has its own validation, permission logic, UI rendering components, and supporting files. BashTool alone has 18 files. Tool definitions mix concerns: parameter validation, execution logic, permission checking, result rendering.

**Target state**: Clean `Tool.define()` pattern — Zod schema in, string result out. Permissions, UI rendering, and truncation handled by the framework, not each tool.

### What changes
- Create `src/tools/framework.ts` with:
  ```typescript
  interface ToolDefinition<P extends z.ZodType> {
    id: string
    description: string  // or imported from .txt file
    parameters: P
    execute(args: z.infer<P>, ctx: ToolContext): Promise<ToolResult>
  }
  
  interface ToolResult {
    title: string
    output: string
    metadata?: Record<string, unknown>
  }
  
  interface ToolContext {
    signal: AbortSignal
    sessionId: string
    askPermission(request: PermissionRequest): Promise<boolean>
    reportProgress(msg: string): void
  }
  ```
- Extract permission logic from individual tools into `src/tools/permissions.ts` (centralized)
- Extract UI rendering from tool files into `src/components/tools/` (render based on tool result type, not per-tool custom components)
- Add auto-truncation wrapper (full output saved to temp file, truncated version sent to LLM)
- Migrate tools one-by-one to new interface (can coexist with old interface during transition)
- Consolidate BashTool's 18 files into ~4: `bash.ts` (main), `bash-security.ts` (command analysis), `bash-permissions.ts` (permission rules), `bash-shell.ts` (persistent shell session)

### Tool migration order
1. Simple tools first: glob, grep, read, write, ls
2. Medium tools: edit, webfetch, websearch
3. Complex tools: bash (last, most files)
4. Meta tools: agent, task, skill

### Risks
- Tool result rendering is currently tightly coupled to Ink components
- Some tools have complex permission logic that may not fit a simple pattern
- Need backward compatibility during migration

### Dependencies
- Easier after Phase 1 (tool results can use AI SDK tool protocol)

---

## Phase 4: Shadow Git Snapshots for Undo

**Current state**: No built-in undo mechanism for file changes made by the agent.

**Target state**: Shadow git repository tracks all file changes. Snapshots taken before each LLM step. Users can revert to any previous snapshot.

### What changes
- Create `src/snapshots/` module:
  - `snapshot.ts` — init shadow repo, take snapshots, list snapshots, revert
  - `tracker.ts` — file change tracking (which files were modified per step)
- Shadow repo lives in `.noble-base-code/snapshots/` (or project-level `.nbcode/snapshots/`)
- Before each tool execution step, capture snapshot of affected files
- Add `/undo` command to revert to previous snapshot
- Add `/snapshots` command to list available snapshots
- Prune snapshots older than 7 days (configurable)
- Max 2MB per tracked file (skip large binaries)

### Risks
- Performance overhead of git operations (mitigated by only snapshotting changed files)
- Disk space for shadow repo (mitigated by pruning)
- Conflicts with user's actual git repo (shadow repo is separate)

### Dependencies
- None (fully independent)

---

## Phase 5: External Model Registry

**Current state**: Model capabilities, pricing, and context limits are hardcoded across `src/utils/model/configs.ts`, `src/utils/model/modelCapabilities.ts`, and other files. Adding a new model requires code changes.

**Target state**: Model metadata fetched from an external registry (models.dev or self-hosted JSON) and cached locally. New models available without code changes.

### What changes
- Create `src/models/registry.ts`:
  - Fetch model metadata from models.dev (or fallback JSON)
  - Cache locally for 5 minutes (or configurable)
  - Merge with local overrides from config
- Create `src/models/types.ts` — model metadata schema (Zod validated)
- Migrate `src/utils/model/configs.ts` to use registry
- Migrate `src/utils/model/modelCapabilities.ts` to use registry
- Keep hardcoded fallback for offline operation

### Risks
- External service dependency (mitigated by fallback)
- models.dev schema changes (mitigated by Zod validation + fallback)

### Dependencies
- Easier after Phase 1 (AI SDK already has model metadata)

---

## Phase 6: LSP Auto-Detection

**Current state**: Basic LSP tool exists but doesn't auto-detect or auto-spawn language servers.

**Target state**: Language servers auto-spawn when files of that type are touched. Agent has access to diagnostics, hover, go-to-definition.

### What changes
- Create `src/lsp/` directory:
  - `servers.ts` — language server configs for 15+ languages (TS, Python, Go, Rust, C/C++, Java, Ruby, PHP, etc.)
  - `client.ts` — JSON-RPC LSP client over stdin/stdout
  - `detector.ts` — file extension to language mapping (90+ extensions)
  - `launcher.ts` — spawn/manage LSP server processes
  - `diagnostics.ts` — collect and format diagnostics for the agent
- Auto-spawn appropriate LSP server when file read/edit tools are invoked
- Detect root directory by walking up to find config files (package.json, go.mod, Cargo.toml, etc.)
- Expose `diagnostics` tool that returns compiler errors/warnings
- Configurable in settings (users can add custom LSP servers)

### Server configs to ship (borrowing from OpenCode)
| Language | Server | Detection |
|----------|--------|-----------|
| TypeScript/JavaScript | typescript-language-server | package.json, tsconfig.json |
| Python | pyright | pyproject.toml, setup.py, requirements.txt |
| Go | gopls | go.mod |
| Rust | rust-analyzer | Cargo.toml |
| C/C++ | clangd | CMakeLists.txt, compile_commands.json |
| Java | jdtls | pom.xml, build.gradle |
| Ruby | solargraph | Gemfile |
| PHP | intelephense | composer.json |

### Risks
- LSP servers must be installed by the user (we detect, not install)
- Process management complexity (zombie processes, crashes)
- Memory overhead of running language servers

### Dependencies
- None (independent)

---

## Phase 7: Event-Based State Architecture

**Current state**: Zustand store + React context tightly couples state management to the Ink TUI. Business logic and UI are interleaved in `REPL.tsx` (5K lines).

**Target state**: Event-driven architecture where business logic emits events, and the UI subscribes to them. Clean boundary between "what happened" and "how to render it".

### What changes
- Create `src/events/` directory:
  - `bus.ts` — typed EventEmitter (or pub/sub broker)
  - `types.ts` — all event types (message.created, tool.started, tool.completed, permission.requested, session.updated, etc.)
- Extract business logic from `REPL.tsx` into event-producing services
- Make Zustand store an event subscriber (not the source of truth for business state)
- Make permission flow event-driven: tool emits `permission.requested`, UI subscribes and shows dialog, UI emits `permission.responded`
- Extract from `REPL.tsx`:
  - Tool confirmation logic → `src/services/permissions/`
  - Message handling logic → `src/services/messages/`
  - Session management → `src/services/sessions/`
  - Keyboard shortcut handling → `src/services/keybindings/`

### Risks
- Largest refactor — touches the most files
- Risk of breaking the TUI during migration
- Need to maintain backward compatibility during transition

### Dependencies
- Easier after Phases 1-3 (less code to migrate)

---

## Phase 8: Consolidate Directory Structure

**Current state**: 298 flat files in `src/utils/`, 32 component subdirectories, monolithic files (messages.ts 5.5K lines, print.ts 5.5K lines, REPL.tsx 5K lines, sessionStorage.ts 5K lines).

**Target state**: Domain-organized directories. No file over 1,000 lines. Clear module boundaries.

### What changes

#### Reorganize `src/utils/` (298 files) into domains:
```
src/utils/              → Keep only truly generic utilities (<20 files)
src/filesystem/         ← file.ts, fileHistory.ts, fileStateCache.ts, glob patterns
src/git/                ← git.ts, gitHelpers.ts, commitAttribution.ts
src/auth/               ← auth.ts, sessionIngressAuth.ts, oauth.ts
src/formatting/         ← claudemd.ts, format.ts, markdown.ts
src/config/             ← config.ts, settings.ts, envUtils.ts
```

#### Split monolithic files:
- `src/utils/messages.ts` (5,512 lines) → `src/messages/create.ts`, `src/messages/normalize.ts`, `src/messages/format.ts`, `src/messages/types.ts`
- `src/cli/print.ts` (5,594 lines) → `src/rendering/messages.ts`, `src/rendering/tools.ts`, `src/rendering/markdown.ts`, `src/rendering/diff.ts`
- `src/screens/REPL.tsx` (5,009 lines) → `src/screens/REPL.tsx` (core), `src/screens/REPLDialogs.tsx`, `src/screens/REPLKeyboard.tsx`, `src/screens/REPLMessages.tsx`
- `src/utils/sessionStorage.ts` (5,105 lines) → replaced by Phase 2 (SQLite)

#### Consolidate tool execution:
- `StreamingToolExecutor.ts` + `toolOrchestration.ts` + `toolExecution.ts` + `toolHooks.ts` → `src/tools/executor.ts` + `src/tools/hooks.ts`

#### Consolidate model management:
- 16 files in `src/utils/model/` → 3 files: `src/models/core.ts`, `src/models/providers.ts`, `src/models/config.ts` (or replaced by Phase 1 + Phase 5)

### Risks
- Many import paths change (can use barrel exports for backward compat)
- Git blame history gets harder to follow
- Need comprehensive test coverage before reorganizing

### Dependencies
- Should be done AFTER Phases 1-7 (those phases eliminate/rewrite many of these files, so reorganizing first would be wasted effort)

---

## Implementation Order

```
Phase 1 (AI SDK) ──────────┐
                            ├──→ Phase 5 (Model Registry)
Phase 2 (SQLite) ──────────┤
                            ├──→ Phase 3 (Tool Interface)
Phase 4 (Snapshots) ───────┤
                            ├──→ Phase 7 (Event Architecture)
Phase 6 (LSP) ─────────────┤
                            └──→ Phase 8 (Directory Reorg) [LAST]
```

Phases 1, 2, 4, and 6 can run in parallel. Phase 3 benefits from Phase 1. Phase 5 benefits from Phase 1. Phase 7 benefits from all prior phases. Phase 8 is a cleanup pass done last.

---

## Success Criteria

- No file over 1,000 lines
- `src/utils/` has fewer than 30 files
- Adding a new LLM provider requires only configuration, not code
- Sessions are queryable via SQL
- File changes are undoable
- Agent has access to compiler diagnostics
- Business logic is testable without rendering the TUI
- A new developer can understand the codebase structure in under 30 minutes
