# OpenAI-Compatible Model Allowlist & Feature Bridging

> Updated: 2026-03-31
> Status: **Implemented** — Tier 1 models only, all features bridged

---

## Supported Models (Tier 1 Only)

Only these models are accepted when `OPENAI_COMPATIBLE=true`. All support reasoning tokens, native tool calling, and structured outputs through standard OpenAI-compatible APIs.

| Model Pattern | Active Params | Context | Thinking | SWE-bench | License |
|---|---|---|---|---|---|
| `Qwen/Qwen3-Coder-480B*` | 35B (MoE) | 256K | qwen3 parser | 66.5-69.6% | Apache 2.0 |
| `Qwen/Qwen3-Coder-Next*` | 3B (MoE) | 256K | qwen3 parser | 70.6% | Apache 2.0 |
| `deepseek-ai/DeepSeek-V3*` | 37B (MoE) | 128-164K | deepseek_r1 parser | 67.8% | MIT |
| `deepseek-ai/DeepSeek-R1*` | 37B (MoE) | 160K | deepseek_r1 parser | N/A | MIT |
| `THUDM/GLM-4.7*` | 32B (MoE) | 128-200K | glm4_moe parser | 73.8% | MIT |
| `google/gemma-4-31B*` | 31B (dense) | 256K | gemma4 parser | LCB v6: 80% | Apache 2.0 |
| `google/gemma-4-26B*` | 3.8B (MoE) | 128K | gemma4 parser | LCB v6: 77.1% | Apache 2.0 |

Setting `OPENAI_MODEL` to anything not matching these patterns will fail at startup with a clear error.

---

## Implemented Features

### Model Capability Registry (`modelRegistry.ts`)

Central source of truth for what each Tier 1 model supports. Feature guards in `thinking.ts`, `effort.ts`, and `context.ts` query this instead of returning blanket `false` for `openai_compatible`.

### Thinking Token Bridging

Maps `delta.reasoning` / `delta.reasoning_content` from vLLM/SGLang/Ollama SSE streams to Anthropic-style `thinking` content blocks. The stream processor detects reasoning tokens before content tokens and emits:
- `content_block_start {type: 'thinking'}`
- `content_block_delta {type: 'thinking_delta', thinking: ...}`
- `content_block_stop` (on transition to text or tool calls)

Prior thinking is preserved across turns wrapped in `<thinking>` XML tags.

### Client-Side Tool Search (`clientToolSearch.ts`)

Replicates Anthropic's ToolSearchTool for models that don't support `tool_reference` blocks:
- Partitions tools into always-loaded and deferred using existing `isDeferredTool()` logic
- Injects a synthetic `ToolSearch` function into the OpenAI tools list
- Keyword matching: exact name → prefix → substring scoring
- Supports same query syntax: `"select:Read,Edit"`, `"notebook jupyter"`, `"+slack send"`

### Context Management (Observation Masking)

When approaching 85% of the context window, truncates old tool results:
- Keeps the most recent 10 turns fully intact
- For older turns: preserves user messages and assistant text, replaces `tool_result` content with `[Output truncated - N chars]`
- Token estimation via chars/4 heuristic

### Effort Control

Maps effort levels to `reasoning_effort` in the request body. Feature guards now query the registry to enable effort for Tier 1 models. Budget mapping in `modelRegistry.ts`:
- `low` → 2048 thinking tokens
- `medium` → 8192 thinking tokens
- `high` / `max` → unlimited (model default)

### Not Bridged (Anthropic-Only)

| Feature | Reason |
|---|---|
| Fast Mode | Anthropic serving infrastructure optimization |
| Prompt Caching | Use `--enable-prefix-caching` in vLLM instead |
| Advisor Tool | Anthropic first-party service |
| Beta Headers | Anthropic API-specific HTTP headers |

---

## Serving Framework Setup

### vLLM (Recommended)
```bash
# Qwen3-Coder with full features
vllm serve Qwen/Qwen3-Coder-480B-A35B-Instruct \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  --enable-prefix-caching \
  --max-model-len 262144

# DeepSeek V3.2
vllm serve deepseek-ai/DeepSeek-V3.2 \
  --reasoning-parser deepseek_r1 \
  --enable-auto-tool-choice \
  --tool-call-parser deepseek_v3 \
  --enable-prefix-caching

# GLM-4.7
vllm serve THUDM/GLM-4.7 \
  --reasoning-parser glm4_moe \
  --enable-auto-tool-choice \
  --enable-prefix-caching

# Gemma 4 31B
vllm serve google/gemma-4-31B-it \
  --reasoning-parser gemma4 \
  --enable-auto-tool-choice \
  --tool-call-parser gemma4 \
  --enable-prefix-caching \
  --max-model-len 262144
```

### SGLang
```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen3-Coder-480B-A35B-Instruct \
  --reasoning-parser qwen3 \
  --tool-call-parser hermes
```

### Ollama (Local development)
```bash
ollama run qwen3-coder
# Note: Ollama uses 'thinking' field — adapter checks both 'reasoning' and 'reasoning_content'
```

---

## Configuration

```bash
export OPENAI_COMPATIBLE=true
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_MODEL=Qwen/Qwen3-Coder-480B-A35B-Instruct
export OPENAI_API_KEY=sk-1234567        # optional for local endpoints
# Optional overrides (defaults from model registry):
export OPENAI_MAX_TOKENS=32768          # default varies by model
export OPENAI_CONTEXT_WINDOW=262144     # default varies by model
```

---

## Architecture

```
src/services/api/openai/
├── modelRegistry.ts        # Tier 1 model capabilities & validation
├── config.ts               # Config + model validation at startup
├── types.ts                # OpenAI types (with reasoning delta fields)
├── queryOpenAI.ts          # Query function with thinking bridge, masking, effort
├── messageTranslation.ts   # Bidirectional format conversion + observation masking
└── clientToolSearch.ts     # Client-side tool search for deferred tools

Feature guards (query registry):
├── src/utils/thinking.ts   # modelSupportsThinking() → registry lookup
├── src/utils/effort.ts     # modelSupportsEffort() → registry lookup
└── src/utils/context.ts    # context window + max tokens → registry defaults
```
