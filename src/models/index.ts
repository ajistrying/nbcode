/**
 * External Model Registry — barrel export.
 */

// Types and schemas
export {
  ModelCapabilitiesSchema,
  ModelProviderMappingSchema,
  ModelEntrySchema,
  ModelRegistrySchema,
} from './types.js'
export type {
  ModelCapabilities,
  ModelProviderMapping,
  ModelEntry,
  ModelRegistry,
} from './types.js'

// Fallback data
export { FALLBACK_REGISTRY } from './fallback.js'

// Registry operations
export {
  fetchModelRegistry,
  loadLocalRegistry,
  getCachedRegistry,
  getModelEntry,
  getRegistryContextWindow,
  getRegistryMaxOutputTokens,
  getRegistryCapabilities,
  _resetCache,
} from './registry.js'
