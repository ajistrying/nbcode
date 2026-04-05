/**
 * Tier 1 model capability registry for OpenAI-compatible providers.
 *
 * Only models in this registry are allowed when OPENAI_COMPATIBLE=true.
 * Feature guards (thinking.ts, effort.ts, context.ts) query this registry
 * instead of returning blanket `false` for all OpenAI-compatible models.
 *
 * Models not in the hardcoded TIER1_MODELS array are looked up in the
 * external model registry (~/.claude/models.json or remote) as a fallback.
 */

import { getModelEntry, getCachedRegistry } from '../../../models/registry.js'

export interface Tier1ModelCapabilities {
  /** Regex pattern to match against OPENAI_MODEL env var */
  pattern: RegExp
  /** Human-readable name for error messages */
  displayName: string
  /** Model supports reasoning/thinking tokens (delta.reasoning field) */
  supportsThinking: boolean
  /** Model supports effort control via thinking budget */
  supportsEffort: boolean
  /** Default context window size in tokens */
  defaultContextWindow: number
  /** Default max output tokens */
  defaultMaxTokens: number
}

const TIER1_MODELS: Tier1ModelCapabilities[] = [
  {
    pattern: /^Qwen\/Qwen3-Coder-480B/i,
    displayName: 'Qwen3-Coder-480B',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
  },
  {
    pattern: /^Qwen\/Qwen3-Coder-Next/i,
    displayName: 'Qwen3-Coder-Next',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
  },
  {
    pattern: /^deepseek-ai\/DeepSeek-V3/i,
    displayName: 'DeepSeek-V3',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 131072,
    defaultMaxTokens: 16384,
  },
  {
    pattern: /^deepseek-ai\/DeepSeek-R1/i,
    displayName: 'DeepSeek-R1',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 163840,
    defaultMaxTokens: 16384,
  },
  {
    pattern: /^THUDM\/GLM-4\.7/i,
    displayName: 'GLM-4.7',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 131072,
    defaultMaxTokens: 16384,
  },
  {
    pattern: /^google\/gemma-4-31B/i,
    displayName: 'Gemma 4 31B',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 262144,
    defaultMaxTokens: 16384,
  },
  {
    pattern: /^google\/gemma-4-26B/i,
    displayName: 'Gemma 4 26B (MoE)',
    supportsThinking: true,
    supportsEffort: true,
    defaultContextWindow: 131072,
    defaultMaxTokens: 16384,
  },
]

/**
 * Look up capabilities for a model string. Returns undefined if the model
 * is not in the Tier 1 allowlist or the external model registry.
 *
 * Resolution order:
 *   1. Hardcoded TIER1_MODELS array (fastest, always available)
 *   2. External model registry fallback (for user-added models)
 */
export function getTier1Capabilities(
  model: string,
): Tier1ModelCapabilities | undefined {
  // 1. Check hardcoded models first
  const hardcoded = TIER1_MODELS.find((m) => m.pattern.test(model))
  if (hardcoded) return hardcoded

  // 2. Fall back to external model registry for models with matchPattern
  const entry = getModelEntry(model)
  if (entry?.matchPattern) {
    return {
      pattern: new RegExp(entry.matchPattern, 'i'),
      displayName: entry.displayName,
      supportsThinking: entry.capabilities?.supportsThinking ?? false,
      supportsEffort: entry.capabilities?.supportsEffort ?? false,
      defaultContextWindow: entry.contextWindow,
      defaultMaxTokens: entry.defaultMaxTokens ?? entry.maxOutputTokens,
    }
  }

  return undefined
}

/**
 * Check if a model is in the Tier 1 allowlist.
 */
export function isTier1Model(model: string): boolean {
  return getTier1Capabilities(model) !== undefined
}

/**
 * Get the default context window for a Tier 1 model.
 * Falls back to 131072 if the model is not recognized (should not happen
 * after validation, but provides a safe default).
 */
export function getTier1ContextWindow(model: string): number {
  return getTier1Capabilities(model)?.defaultContextWindow ?? 131072
}

/**
 * Get the default max output tokens for a Tier 1 model.
 * Falls back to 16384 if the model is not recognized.
 */
export function getTier1MaxTokens(model: string): number {
  return getTier1Capabilities(model)?.defaultMaxTokens ?? 16384
}

/**
 * Get all supported model patterns as strings for error messages.
 * Includes hardcoded models plus any registry models with matchPattern.
 */
export function getSupportedModelPatterns(): string[] {
  const hardcoded = TIER1_MODELS.map((m) => m.displayName)
  try {
    const registry = getCachedRegistry()
    const registryNames = registry.models
      .filter(
        (m) =>
          m.matchPattern &&
          !hardcoded.includes(m.displayName),
      )
      .map((m) => m.displayName)
    return [...hardcoded, ...registryNames]
  } catch {
    return hardcoded
  }
}

/**
 * Map an effort level to a thinking token budget hint.
 * Returns null for 'high' (unlimited thinking) or if the model
 * doesn't support effort control.
 */
export function mapEffortToThinkingBudget(
  model: string,
  effort: string,
): number | null {
  const caps = getTier1Capabilities(model)
  if (!caps?.supportsEffort) return null

  switch (effort) {
    case 'low':
      return 2048
    case 'medium':
      return 8192
    case 'high':
    case 'max':
      return null // unlimited — model default
    default:
      return null
  }
}
