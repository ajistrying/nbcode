# Noble Base Code

**An unlocked CLI coding agent with open-source model support.**

API-key-only authentication. All telemetry stripped. All experimental features unlocked. Support for OpenAI-compatible endpoints (vLLM, TGI, HF Inference).

```bash
curl -fsSL https://raw.githubusercontent.com/ajistrying/free-code/main/install.sh | bash
```

> Checks your system, installs Bun if needed, clones, builds with all features enabled, and puts `nbcode` on your PATH. Then just `export ANTHROPIC_API_KEY="sk-ant-..."` and run `nbcode`.

---

## Quick start

### With Anthropic API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
nbcode
```

### With an open-source model (vLLM / TGI / HF Inference)

```bash
# Start vLLM with your model
vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct \
  --enable-auto-tool-choice --tool-call-parser qwen3_coder

# Run Noble Base Code against it
export OPENAI_COMPATIBLE=true
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_MODEL=Qwen/Qwen3-Coder-30B-A3B-Instruct
nbcode
```

---

## What is this

This is a modified fork of Anthropic's [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI, with three categories of changes:

### 1. API-key-only authentication
All OAuth and Claude.ai subscriber flows are bypassed. Authentication is exclusively via `ANTHROPIC_API_KEY`. No keychain access, no token refresh, no Claude.ai login.

### 2. Telemetry removed
All outbound telemetry endpoints are dead-code-eliminated or stubbed. No crash reports, no usage analytics, no session fingerprinting.

### 3. OpenAI-compatible model support
A new provider adapter enables any model served via an OpenAI-compatible API (vLLM, TGI, HF Inference Endpoints). The adapter translates message formats, tool schemas, and streaming events bidirectionally.

### 4. All experimental features enabled
45+ feature flags are unlocked. See [FEATURES.md](FEATURES.md) for the full audit.

---

## Requirements

- [Bun](https://bun.sh) >= 1.3.11
- macOS or Linux (Windows via WSL)
- An Anthropic API key **or** an OpenAI-compatible endpoint

---

## Build

```bash
git clone https://github.com/ajistrying/free-code.git noble-base-code
cd noble-base-code
bun install
bun run build:dev:full    # produces ./cli-dev with all features
```

### Symlink it

```bash
ln -sf "$(pwd)/cli-dev" /usr/local/bin/nbcode
```

---

## Run

```bash
# Interactive REPL (default)
nbcode

# One-shot mode
nbcode -p "what files are in this directory?"

# With specific model
nbcode --model claude-sonnet-4-6-20250514
```

---

## OpenAI-compatible provider

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_COMPATIBLE` | Yes | - | Set to `true` |
| `OPENAI_BASE_URL` | Yes | - | e.g. `http://localhost:8000/v1` |
| `OPENAI_MODEL` | Yes | - | e.g. `Qwen/Qwen3-Coder-30B-A3B-Instruct` |
| `OPENAI_API_KEY` | No | `no-key` | For authenticated endpoints |
| `OPENAI_MAX_TOKENS` | No | `16384` | Max output tokens |
| `OPENAI_CONTEXT_WINDOW` | No | `131072` | Context window size |

### Recommended models

| Model | Params (active) | Context | Best for |
|---|---|---|---|
| **Qwen3-Coder-30B-A3B** | 3B | 256K | Single GPU, best balance |
| **Qwen 2.5 Coder 32B** | 32B | 128K | Most battle-tested |
| **Qwen3-Coder-Next** | 3B | 256K | Highest SWE-bench on consumer HW |
| **MiniMax-M2.5** | 10B | 200K | Frontier (multi-GPU) |

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full pipeline documentation.

---

## License

The original Claude Code source is the property of Anthropic. This fork exists because the source was publicly exposed through their npm distribution. Use at your own discretion.
