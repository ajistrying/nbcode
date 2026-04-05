/**
 * Model metadata types and Zod schemas.
 *
 * These define the shape of model information that can come from:
 * 1. External registry (models.dev or custom URL)
 * 2. Local JSON file (~/.claude/models.json)
 * 3. Hardcoded fallback (for offline operation)
 */

import { z } from 'zod/v4'

export const ModelCapabilitiesSchema = z.object({
  supportsThinking: z.boolean().default(false),
  supportsEffort: z.boolean().default(false),
  supportsImages: z.boolean().default(false),
  supportsPdfs: z.boolean().default(false),
  supportsPromptCaching: z.boolean().default(false),
  supports1mContext: z.boolean().default(false),
})

export const ModelProviderMappingSchema = z.object({
  firstParty: z.string().optional(),
  bedrock: z.string().optional(),
  vertex: z.string().optional(),
  foundry: z.string().optional(),
  openai: z.string().optional(),
})

export const ModelEntrySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  provider: z.string(), // 'anthropic' | 'openai' | 'google' | 'deepseek' | 'qwen' | etc.
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  defaultMaxTokens: z.number().int().positive().optional(),
  capabilities: ModelCapabilitiesSchema.optional(),
  providerMapping: ModelProviderMappingSchema.optional(),
  pricing: z
    .object({
      inputPerMillion: z.number().optional(),
      outputPerMillion: z.number().optional(),
      cacheReadPerMillion: z.number().optional(),
      cacheWritePerMillion: z.number().optional(),
    })
    .optional(),
  aliases: z.array(z.string()).optional(),
  // Regex pattern for matching (used by OpenAI-compatible Tier 1 models)
  matchPattern: z.string().optional(),
  defaultEffortLevel: z.string().optional(),
  alwaysOnThinking: z.boolean().optional(),
})

export const ModelRegistrySchema = z.object({
  version: z.number().int().default(1),
  updatedAt: z.string().optional(),
  models: z.array(ModelEntrySchema),
})

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>
export type ModelProviderMapping = z.infer<typeof ModelProviderMappingSchema>
export type ModelEntry = z.infer<typeof ModelEntrySchema>
export type ModelRegistry = z.infer<typeof ModelRegistrySchema>
