/**
 * Hardcoded fallback model registry.
 *
 * Ensures the system works fully offline without any network access.
 * Contains all Claude models with provider mappings and all Tier 1
 * OpenAI-compatible models with their capabilities.
 */

import type { ModelRegistry } from './types.js'

export const FALLBACK_REGISTRY: ModelRegistry = {
  version: 1,
  updatedAt: '2026-04-01T00:00:00Z',
  models: [
    // ── Claude 3.5 Haiku ──────────────────────────────────────────
    {
      id: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      defaultMaxTokens: 8_192,
      capabilities: {
        supportsThinking: false,
        supportsEffort: false,
        supportsImages: true,
        supportsPdfs: false,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-3-5-haiku-20241022',
        bedrock: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
        vertex: 'claude-3-5-haiku@20241022',
        foundry: 'claude-3-5-haiku',
      },
      aliases: ['claude-3.5-haiku', 'haiku-3.5'],
    },

    // ── Claude 3.5 Sonnet V2 ─────────────────────────────────────
    {
      id: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet V2',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      defaultMaxTokens: 8_192,
      capabilities: {
        supportsThinking: false,
        supportsEffort: false,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-3-5-sonnet-20241022',
        bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        vertex: 'claude-3-5-sonnet-v2@20241022',
        foundry: 'claude-3-5-sonnet',
      },
      aliases: ['claude-3.5-sonnet', 'sonnet-3.5'],
    },

    // ── Claude 3.7 Sonnet ────────────────────────────────────────
    {
      id: 'claude-3-7-sonnet-20250219',
      displayName: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-3-7-sonnet-20250219',
        bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        vertex: 'claude-3-7-sonnet@20250219',
        foundry: 'claude-3-7-sonnet',
      },
      aliases: ['claude-3.7-sonnet', 'sonnet-3.7'],
    },

    // ── Claude Haiku 4.5 ─────────────────────────────────────────
    {
      id: 'claude-haiku-4-5-20251001',
      displayName: 'Claude Haiku 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-haiku-4-5-20251001',
        bedrock: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        vertex: 'claude-haiku-4-5@20251001',
        foundry: 'claude-haiku-4-5',
      },
      aliases: ['claude-haiku-4.5', 'haiku-4.5'],
    },

    // ── Claude Sonnet 4 ──────────────────────────────────────────
    {
      id: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: true,
      },
      providerMapping: {
        firstParty: 'claude-sonnet-4-20250514',
        bedrock: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        vertex: 'claude-sonnet-4@20250514',
        foundry: 'claude-sonnet-4',
      },
      aliases: ['claude-sonnet-4', 'sonnet-4'],
    },

    // ── Claude Sonnet 4.5 ────────────────────────────────────────
    {
      id: 'claude-sonnet-4-5-20250929',
      displayName: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: true,
      },
      providerMapping: {
        firstParty: 'claude-sonnet-4-5-20250929',
        bedrock: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        vertex: 'claude-sonnet-4-5@20250929',
        foundry: 'claude-sonnet-4-5',
      },
      aliases: ['claude-sonnet-4.5', 'sonnet-4.5'],
    },

    // ── Claude Sonnet 4.6 ────────────────────────────────────────
    {
      id: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: true,
      },
      providerMapping: {
        firstParty: 'claude-sonnet-4-6',
        bedrock: 'us.anthropic.claude-sonnet-4-6',
        vertex: 'claude-sonnet-4-6',
        foundry: 'claude-sonnet-4-6',
      },
      aliases: ['sonnet-4.6'],
    },

    // ── Claude Opus 4 ────────────────────────────────────────────
    {
      id: 'claude-opus-4-20250514',
      displayName: 'Claude Opus 4',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-opus-4-20250514',
        bedrock: 'us.anthropic.claude-opus-4-20250514-v1:0',
        vertex: 'claude-opus-4@20250514',
        foundry: 'claude-opus-4',
      },
      aliases: ['claude-opus-4', 'opus-4'],
    },

    // ── Claude Opus 4.1 ──────────────────────────────────────────
    {
      id: 'claude-opus-4-1-20250805',
      displayName: 'Claude Opus 4.1',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-opus-4-1-20250805',
        bedrock: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
        vertex: 'claude-opus-4-1@20250805',
        foundry: 'claude-opus-4-1',
      },
      aliases: ['claude-opus-4.1', 'opus-4.1'],
    },

    // ── Claude Opus 4.5 ──────────────────────────────────────────
    {
      id: 'claude-opus-4-5-20251101',
      displayName: 'Claude Opus 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      defaultMaxTokens: 32_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: false,
      },
      providerMapping: {
        firstParty: 'claude-opus-4-5-20251101',
        bedrock: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
        vertex: 'claude-opus-4-5@20251101',
        foundry: 'claude-opus-4-5',
      },
      aliases: ['claude-opus-4.5', 'opus-4.5'],
    },

    // ── Claude Opus 4.6 ──────────────────────────────────────────
    {
      id: 'claude-opus-4-6',
      displayName: 'Claude Opus 4.6',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 128_000,
      defaultMaxTokens: 64_000,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: true,
        supportsPdfs: true,
        supportsPromptCaching: true,
        supports1mContext: true,
      },
      providerMapping: {
        firstParty: 'claude-opus-4-6',
        bedrock: 'us.anthropic.claude-opus-4-6-v1',
        vertex: 'claude-opus-4-6',
        foundry: 'claude-opus-4-6',
      },
      aliases: ['opus-4.6'],
    },

    // ── Tier 1 OpenAI-Compatible: Qwen3-Coder-480B ──────────────
    {
      id: 'Qwen/Qwen3-Coder-480B',
      displayName: 'Qwen3-Coder-480B',
      provider: 'qwen',
      contextWindow: 262_144,
      maxOutputTokens: 32_768,
      defaultMaxTokens: 32_768,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^Qwen\\/Qwen3-Coder-480B',
      aliases: ['qwen3-coder', 'qwen3-coder-480b'],
    },

    // ── Tier 1 OpenAI-Compatible: Qwen3-Coder-Next ──────────────
    {
      id: 'Qwen/Qwen3-Coder-Next',
      displayName: 'Qwen3-Coder-Next',
      provider: 'qwen',
      contextWindow: 262_144,
      maxOutputTokens: 32_768,
      defaultMaxTokens: 32_768,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^Qwen\\/Qwen3-Coder-Next',
      aliases: ['qwen3-coder-next'],
    },

    // ── Tier 1 OpenAI-Compatible: DeepSeek-V3 ───────────────────
    {
      id: 'deepseek-ai/DeepSeek-V3',
      displayName: 'DeepSeek-V3',
      provider: 'deepseek',
      contextWindow: 131_072,
      maxOutputTokens: 16_384,
      defaultMaxTokens: 16_384,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^deepseek-ai\\/DeepSeek-V3',
      aliases: ['deepseek-v3'],
    },

    // ── Tier 1 OpenAI-Compatible: DeepSeek-R1 ───────────────────
    {
      id: 'deepseek-ai/DeepSeek-R1',
      displayName: 'DeepSeek-R1',
      provider: 'deepseek',
      contextWindow: 163_840,
      maxOutputTokens: 16_384,
      defaultMaxTokens: 16_384,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^deepseek-ai\\/DeepSeek-R1',
      aliases: ['deepseek-r1'],
    },

    // ── Tier 1 OpenAI-Compatible: GLM-4.7 ───────────────────────
    {
      id: 'THUDM/GLM-4.7',
      displayName: 'GLM-4.7',
      provider: 'thudm',
      contextWindow: 131_072,
      maxOutputTokens: 16_384,
      defaultMaxTokens: 16_384,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^THUDM\\/GLM-4\\.7',
      aliases: ['glm-4.7'],
    },

    // ── Tier 1 OpenAI-Compatible: Gemma 4 31B ───────────────────
    {
      id: 'google/gemma-4-31B',
      displayName: 'Gemma 4 31B',
      provider: 'google',
      contextWindow: 262_144,
      maxOutputTokens: 16_384,
      defaultMaxTokens: 16_384,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^google\\/gemma-4-31B',
      aliases: ['gemma-4-31b', 'gemma-4'],
    },

    // ── Tier 1 OpenAI-Compatible: Gemma 4 26B (MoE) ─────────────
    {
      id: 'google/gemma-4-26B',
      displayName: 'Gemma 4 26B (MoE)',
      provider: 'google',
      contextWindow: 131_072,
      maxOutputTokens: 16_384,
      defaultMaxTokens: 16_384,
      capabilities: {
        supportsThinking: true,
        supportsEffort: true,
        supportsImages: false,
        supportsPdfs: false,
        supportsPromptCaching: false,
        supports1mContext: false,
      },
      matchPattern: '^google\\/gemma-4-26B',
      aliases: ['gemma-4-26b', 'gemma-4-moe'],
    },
  ],
}
