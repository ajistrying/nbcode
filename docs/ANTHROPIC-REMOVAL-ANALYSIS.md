# Anthropic Code Removal Analysis

> Date: 2026-04-04
> Purpose: Estimate the effort to make Noble Base Code fully model-agnostic
> by removing all Anthropic/Claude-specific code.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Gets Removed](#what-gets-removed)
3. [What Needs Porting](#what-needs-porting)
4. [Component-by-Component Analysis](#component-by-component-analysis)
5. [Code Reduction Estimates](#code-reduction-estimates)
6. [Recommended Phasing](#recommended-phasing)
7. [Risk Assessment](#risk-assessment)

---

## Executive Summary

The codebase has **two distinct layers**: a model-agnostic CLI agent framework
(~238K lines) and an Anthropic-specific integration layer (~45K lines of code
plus ~25K lines of Anthropic SDK dependencies wired throughout).

**Bottom line:**
- **~45-55K lines** of Anthropic-specific code can be removed outright
- **~15-20K lines** need to be ported/replaced with model-agnostic equivalents
- **6 Anthropic npm packages** removed from dependencies
- The Internal Message Type migration is **~70% complete** — this is the hardest part
- **Estimated total effort: 6-10 weeks** for a single experienced developer, broken into
  3 phases of decreasing risk

The biggest risk is not the deletion — it's ensuring the **model-agnostic replacements**
for features like extended thinking, prompt caching, and beta headers work correctly
across providers.

---

## What Gets Removed

### 1. Anthropic SDK Packages (Full Removal)

| Package | Current Version | Lines Affected | Notes |
|---|---|---|---|
| `@anthropic-ai/sdk` | ^0.80.0 | Core dependency, 97+ files import it | Primary API client |
| `@anthropic-ai/bedrock-sdk` | ^0.26.4 | ~5 files | AWS Bedrock provider |
| `@anthropic-ai/vertex-sdk` | ^0.14.4 | ~5 files | GCP Vertex provider |
| `@anthropic-ai/foundry-sdk` | ^0.2.3 | ~3 files | Azure Foundry provider |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.87 | ~10 files | Agent SDK |
| `@anthropic-ai/mcpb` | ^2.1.2 | ~3 files | MCP bridge |

**Also removed:** `@anthropic-ai/sandbox-runtime` (^0.0.44)

### 2. OAuth & Authentication to claude.ai

```
Files to remove entirely:
├── src/constants/oauth.ts          — OAuth config (client IDs, scopes, endpoints)
├── src/utils/auth.ts               — ~80% of file (OAuth flows, token refresh,
│                                     isClaudeAISubscriber(), subscriber checks)
├── src/commands/login/             — Claude.ai login flow
├── src/commands/logout/            — Claude.ai logout flow
├── src/commands/oauth-refresh/     — Token refresh command
└── src/commands/passes/            — Guest pass management

Constants removed:
- OAuth client ID: 9d1c250a-e61b-44d9-88ed-5944d1962f5e
- Token URLs: platform.claude.com, claude.ai, claude.com
- Scopes: user:inference, user:profile, user:sessions:claude_code, etc.
- Claude Desktop handoff URLs
```

**Estimated lines removed: ~3,000-4,000**

### 3. Beta Headers System

```
Files to remove/gut:
├── src/constants/betas.ts          — 20+ Anthropic-specific beta header definitions
└── src/utils/betas.ts              — Beta negotiation logic (getMergedBetas)

Beta headers being removed:
- claude-code-20250219
- interleaved-thinking-2025-05-14
- context-1m-2025-08-07
- context-management-2025-06-27
- structured-outputs-2025-12-15
- tool-search-tool-2025-10-19 / advanced-tool-use-2025-11-20
- web-search-2025-03-05
- redact-thinking-2026-02-12
- token-efficient-tools-2026-03-28
- oauth-2025-04-20
- cli-internal-2026-02-09
- And ~10 more...
```

**Estimated lines removed: ~800-1,200**

### 4. Anthropic API Client & Streaming

```
Files to remove entirely:
├── src/services/api/client.ts          — getAnthropicClient() factory
│                                        (creates Anthropic/Bedrock/Vertex/Foundry clients)
└── src/services/api/claude.ts          — queryModelWithStreaming() / queryModel()
                                         (~3,400 lines, the entire Anthropic streaming path)

Files to gut (remove Anthropic-specific sections):
├── src/services/api/withRetry.ts       — Anthropic error codes, fallback logic
├── src/services/api/errorUtils.ts      — Anthropic error type parsing
├── src/services/api/usage.ts           — Anthropic usage tracking
└── src/services/api/metricsOptOut.ts   — Anthropic metrics endpoints
```

**Estimated lines removed: ~5,000-6,000**

### 5. Subscription & Organization Code

```
Files to remove/gut:
├── src/services/claudeAiLimits.ts      — Claude.ai rate limiting per subscription tier
├── src/services/api/referral.ts        — Referral program endpoints
├── src/commands/extra-usage/           — Extra usage purchase flows
├── src/commands/rate-limit-options/    — Rate limit management
├── src/commands/reset-limits/          — Limit reset functionality
├── src/commands/mock-limits/           — Dev limit mocking
└── src/commands/passes/                — Guest pass system

Logic removed from:
├── src/utils/auth.ts                   — isClaudeAISubscriber(), subscription checks
├── src/commands.ts                     — meetsAvailabilityRequirement() 'claude-ai'/'console' paths
└── Various UI components               — Subscriber-gated features
```

**Estimated lines removed: ~2,000-3,000**

### 6. Claude.ai UI & Branding

```
Files to remove:
├── src/ui/solid/components/DesktopHandoff.solid.tsx
├── src/ui/solid/components/ClaudeInChromeOnboarding.solid.tsx
├── src/ui/solid/components/ConsoleOAuthFlow.solid.tsx
├── src/commands/desktop/              — Claude Desktop integration
├── src/commands/chrome/               — Chrome extension
├── src/commands/mobile/               — Mobile QR (claude.ai specific)
├── src/commands/install-github-app/   — Anthropic GitHub app
├── src/commands/install-slack-app/    — Anthropic Slack app

Strings/URLs to remove:
- "claude.ai" references
- "Claude Desktop" references  
- "Anthropic" branding
- Privacy policy links to claude.ai
- winget upgrade Anthropic.ClaudeCode
```

**Estimated lines removed: ~2,000-3,000**

### 7. Claude.ai MCP Integration

```
Files to remove:
└── src/services/mcp/claudeai.ts       — claudeai-proxy transport type
                                         Fetches official MCP connectors from Anthropic infra
```

**Estimated lines removed: ~300-500**

### 8. Internal/Ant-Only Code

```
Files to remove:
├── src/commands/ant-trace/            — Internal tracing
├── src/commands/perf-issue/           — Internal perf issue filing
├── src/commands/agents-platform/      — Internal agent platform
├── src/commands/backfill-sessions/    — Internal session backfill
├── src/commands/break-cache/          — Internal cache busting
├── src/commands/bughunter/            — Internal bug hunting
├── src/commands/good-claude/          — Internal feedback
├── src/commands/issue/                — Internal issue filing
├── src/commands/teleport/             — Internal teleport
├── src/commands/bridge-kick.js        — Internal bridge control
├── src/commands/mock-limits/          — Internal limit mocking
└── All code gated by USER_TYPE === 'ant'

Feature flags to remove:
- ANTI_DISTILLATION_CC
- COWORKER_TYPE_TELEMETRY
- NATIVE_CLIENT_ATTESTATION
- BREAK_CACHE_COMMAND
```

**Estimated lines removed: ~3,000-5,000**

---

## What Needs Porting

These features currently depend on Anthropic-specific APIs but have model-agnostic
equivalents that need to be implemented.

### 1. Streaming Provider (CRITICAL — Must Replace)

**Current:** `src/services/api/claude.ts` — Anthropic SDK streaming
**Replace with:** Vercel AI SDK streaming via `@ai-sdk/openai-compatible`

The Vercel AI SDK (`ai` package, already a dependency at ^6.0.146) provides:
- `streamText()` — streaming text generation
- `generateText()` — non-streaming generation
- Tool definitions and execution
- Provider abstraction

**Porting effort:** The OpenAI-compatible path (`src/services/api/openai/queryOpenAI.ts`)
already demonstrates this pattern. The Anthropic path needs the same treatment.

**Lines to write: ~1,500-2,000** (replacing ~3,400 lines of Anthropic-specific streaming)

### 2. Message Type Migration (IN PROGRESS — 70% Complete)

**Current state:**
- Internal types defined: `src/types/internal-messages.ts`
- Converters exist: `src/services/api/converters/{anthropic,ai-sdk}.ts`
- 97 files still reference Anthropic SDK types directly

**Remaining work:**
- Phase 7: Refactor `query.ts` to use internal types throughout
- Phase 8: Refactor tool execution to use internal types
- Phase 9: Remove all direct Anthropic SDK type imports
- Phase 10: Remove Anthropic converter (only AI SDK converter needed)

See `src/services/api/converters/MIGRATION_STATUS.md` for detailed per-file tracking.

**Lines to modify: ~5,000-8,000** across 97 files

### 3. Extended Thinking → Provider-Neutral Reasoning

**Current:** Anthropic-specific `thinking` content blocks with beta headers
**Replace with:** Provider-neutral reasoning API

Options:
- Vercel AI SDK's `reasoningContent` support
- Direct OpenAI-compatible `reasoning_content` field
- Model registry capability check (`supportsThinking`)

**Files affected:**
- `src/utils/thinking.ts` — thinking block handling
- `src/query.ts` — thinking budget management
- `src/components/messages/` — thinking display
- All streaming handlers that process thinking deltas

**Lines to modify: ~500-800**

### 4. Prompt Caching → Provider-Neutral Caching

**Current:** Anthropic `cache_control: { type: 'ephemeral' }` blocks
**Replace with:** Provider-neutral caching hints or remove entirely

Most providers don't support prompt caching, so this may become a no-op for
non-Anthropic providers. The model registry already tracks `supportsPromptCaching`.

**Lines to modify: ~300-500**

### 5. Effort Control → Provider-Neutral Quality Hints

**Current:** Anthropic `output_config.effort` parameter
**Replace with:** Model registry capability check + provider-specific mapping

**Lines to modify: ~200-300**

### 6. Provider Client Factory

**Current:** `getAnthropicClient()` creates SDK clients for 4 Anthropic variants
**Replace with:** AI SDK provider factory

```typescript
// New: single factory for all providers
function getModelProvider(config): LanguageModel {
  // Returns AI SDK compatible model instance
  // Works for any provider via @ai-sdk/openai-compatible
}
```

**Lines to write: ~300-500** (replacing ~600 lines)

---

## Component-by-Component Analysis

### Effort Ratings

| Component | Remove | Port | Effort | Risk |
|---|---|---|---|---|
| **API Client (client.ts)** | 600 lines | 300 lines (new factory) | Medium | Medium |
| **Anthropic Streaming (claude.ts)** | 3,400 lines | 1,500 lines (AI SDK) | High | High |
| **Beta Headers** | 1,200 lines | 0 (remove entirely) | Low | Low |
| **OAuth/Auth** | 3,500 lines | 200 lines (API key only) | Medium | Low |
| **Message Types (97 files)** | N/A | 5,000+ lines modified | Very High | High |
| **Subscription/Limits** | 2,500 lines | 0 (remove entirely) | Low | Low |
| **Branding/UI** | 2,500 lines | 200 lines (rebrand) | Low | Low |
| **MCP claude.ai proxy** | 400 lines | 0 (remove entirely) | Low | Low |
| **Internal-only commands** | 4,000 lines | 0 (remove entirely) | Low | Low |
| **3P Providers (Bedrock/Vertex/Foundry)** | 2,000 lines | 0 (or port to AI SDK) | Medium | Medium |
| **Thinking/Effort/Caching** | 1,500 lines | 800 lines (generic) | Medium | Medium |
| **Error handling** | 800 lines | 400 lines (generic) | Low | Low |
| **Model configs** | 500 lines | 300 lines (registry-based) | Low | Low |

### Files With Highest Anthropic Coupling

These are the files where Anthropic SDK types are most deeply embedded:

| File | Lines | Anthropic Coupling | Difficulty |
|---|---|---|---|
| `src/query.ts` | 68K+ | Moderate (via dep injection) | Medium-High |
| `src/services/api/claude.ts` | 3,400 | Complete (remove entirely) | High |
| `src/services/api/client.ts` | 600 | Complete (remove entirely) | Medium |
| `src/utils/auth.ts` | 20K+ | ~80% Anthropic-specific | Medium |
| `src/utils/betas.ts` | 800 | Complete (remove entirely) | Low |
| `src/utils/messages.ts` | Large | Uses BetaMessageParam throughout | High |
| `src/utils/messages/stream.ts` | Large | Anthropic stream event types | High |
| `src/services/tools/toolExecution.ts` | Large | Uses BetaToolResultBlockParam | Medium |
| `src/screens/REPL.tsx` | 5,000+ | Moderate (mostly provider-agnostic) | Medium |
| `src/constants/betas.ts` | 200 | Complete (remove entirely) | Low |
| `src/constants/oauth.ts` | 300 | Complete (remove entirely) | Low |

---

## Code Reduction Estimates

### Lines Removed (Approximate)

| Category | Lines Removed |
|---|---|
| Anthropic API client + streaming | ~6,000 |
| OAuth/Authentication | ~3,500 |
| Beta headers system | ~1,200 |
| Subscription/limits/billing | ~2,500 |
| Internal-only commands | ~4,000 |
| Branding/UI elements | ~2,500 |
| 3P provider SDKs (Bedrock/Vertex/Foundry) | ~2,000 |
| MCP claude.ai proxy | ~400 |
| Anthropic error handling | ~800 |
| Model config (Anthropic-specific) | ~500 |
| **Total removed** | **~23,400** |

### Lines Added/Modified

| Category | Lines Added |
|---|---|
| AI SDK streaming provider | ~1,500 |
| Provider-neutral client factory | ~500 |
| Generic thinking/effort/caching | ~800 |
| Generic error handling | ~400 |
| Auth simplification (API key only) | ~200 |
| Model config updates | ~300 |
| **Total added** | **~3,700** |

### Net Reduction

```
Lines removed:  ~23,400
Lines added:    ~3,700
─────────────────────────
Net reduction:  ~19,700 lines

Dependencies removed: 7 Anthropic npm packages
Estimated bundle size reduction: ~200-300 KB (SDK + provider bundles)
```

### Additional Cleanup Opportunity

If removing Anthropic code also triggers the Ink removal (since many Anthropic-specific
UI components are only in the Ink layer):

```
Additional Ink removal:     ~20,774 lines
React dependencies removed: react, react-reconciler, @types/react
Additional bundle reduction: ~40 KB runtime

Combined net reduction: ~40,000+ lines
```

---

## Recommended Phasing

### Phase 1: Safe Deletions (1-2 weeks)

**Goal:** Remove code that has no model-agnostic equivalent needed.

```
Remove:
├── OAuth/authentication flows
├── Subscription/billing/limits
├── Internal-only (ant) commands
├── Beta headers system
├── Branding/UI (claude.ai links, desktop handoff, etc.)
├── MCP claude.ai proxy
├── Guest passes
└── Chrome extension integration

Simplify:
├── src/utils/auth.ts → API key only
├── src/commands.ts → remove availability checks
└── Feature flags → remove BRIDGE_MODE runtime gates on OAuth
```

**Risk: Low.** These deletions don't affect the query loop or tool execution.
The application continues working with Anthropic API keys during this phase.

**Validation:** All existing functionality still works with `ANTHROPIC_API_KEY`.

### Phase 2: Provider Abstraction (3-4 weeks)

**Goal:** Replace Anthropic SDK with Vercel AI SDK throughout.

```
Step 1: Complete internal type migration (Phases 7-10 from MIGRATION_STATUS.md)
  - Refactor query.ts to use InternalMessage types
  - Refactor tool execution to use internal types
  - Remove all direct Anthropic SDK type imports

Step 2: Replace Anthropic streaming with AI SDK streaming
  - Write new queryModelWithAISDK() using streamText()
  - Map AI SDK events to existing internal stream event types
  - Handle thinking/reasoning via AI SDK reasoningContent

Step 3: Replace client factory
  - New getModelProvider() returns AI SDK LanguageModel
  - Supports any provider via @ai-sdk/openai-compatible
  - Remove src/services/api/client.ts entirely

Step 4: Remove Anthropic SDK
  - Delete src/services/api/claude.ts
  - Remove @anthropic-ai/* from package.json
  - Run full test suite
```

**Risk: High.** This is the core of the application. Extensive testing required.

**Validation:** All tools work, streaming renders correctly, tool execution loops
complete, context compaction works, subagents function.

### Phase 3: Cleanup & Polish (1-2 weeks)

**Goal:** Remove remaining traces, update docs, ensure everything is clean.

```
Tasks:
├── Remove 3P provider SDKs (Bedrock/Vertex/Foundry) or port to AI SDK
├── Remove Anthropic converter (src/services/api/converters/anthropic.ts)
├── Clean up model configs (remove Anthropic-specific families)
├── Update all documentation
├── Remove feature flags that gated Anthropic-specific behavior
├── Update install.sh and README (remove Anthropic API key references)
└── Optionally: complete Ink removal (if OpenTUI is confirmed stable)
```

**Risk: Low.** Mostly cleanup and documentation.

---

## Risk Assessment

### High-Risk Areas

1. **query.ts refactoring** — This is a 68K+ line file that orchestrates everything.
   Changes here can break the entire application. Mitigation: the dependency injection
   pattern (`productionDeps()`) already isolates the provider, so changes should be
   contained to the `callModel` implementation.

2. **Streaming fidelity** — The Anthropic SDK handles edge cases (retries, backpressure,
   partial JSON in tool calls) that a raw AI SDK implementation might miss.
   Mitigation: the OpenAI-compatible path already handles these cases and can serve
   as a reference implementation.

3. **Tool result format changes** — Tools return `BetaToolResultBlockParam` objects.
   Changing this type propagates through ~40 tool implementations.
   Mitigation: the internal type migration already defines `InternalToolResultBlock`
   and the compat layer in `toolBlockCompat.ts` can bridge during transition.

### Medium-Risk Areas

4. **Extended thinking** — Provider-neutral reasoning varies significantly between
   models. Some support it, others don't. The capability check via the model registry
   handles this, but edge cases around budget management need testing.

5. **Context compaction** — Currently uses the Anthropic API for compaction.
   The replacement needs to work with any model's API.

6. **Subagent system** — Subagents inherit the parent's provider configuration.
   Need to verify the provider factory works recursively.

### Low-Risk Areas

7. **Branding/UI removal** — String replacements, no logic changes.
8. **OAuth removal** — Simplifies the auth path.
9. **Subscription code removal** — Already bypassed in this fork.
10. **Internal command removal** — Already gated behind USER_TYPE === 'ant'.

### What Stays

These model-agnostic components require **zero changes**:

- Tool implementations (40+ tools)
- File system operations
- Git integration
- MCP protocol handling (standard, non-claude.ai)
- Session persistence
- Hook system
- Command/skill framework
- OpenTUI/SolidJS rendering
- Context compaction strategies (logic, not API calls)
- Cost tracking (format, not source)
- Model registry

---

## Decision Matrix

| If you want to... | Do this | Effort |
|---|---|---|
| **Minimum viable**: just remove branding and auth | Phase 1 only | 1-2 weeks |
| **Full agnostic**: remove all Anthropic SDK deps | Phase 1 + 2 + 3 | 6-10 weeks |
| **Maximum cleanup**: also remove Ink | All phases + Ink removal | 8-12 weeks |
| **Keep Bedrock/Vertex/Foundry**: as AI SDK providers | Port to AI SDK instead of delete | +1-2 weeks in Phase 3 |

The safest approach is **Phase 1 first** — it's low-risk, immediately reduces
Anthropic coupling, and validates the direction before touching the query loop.
