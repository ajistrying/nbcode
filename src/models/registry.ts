/**
 * External Model Registry.
 *
 * Provides model metadata through a layered resolution strategy:
 *   1. In-memory cache (fastest, 5-minute TTL)
 *   2. Local file (~/.claude/models.json)
 *   3. Hardcoded fallback (always available, zero network)
 *
 * An optional background fetch from a remote URL updates the cache
 * without ever blocking startup or hot paths.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { logError } from '../utils/log.js'
import { FALLBACK_REGISTRY } from './fallback.js'
import { ModelRegistrySchema } from './types.js'
import type { ModelEntry, ModelRegistry, ModelCapabilities } from './types.js'

// ── Cache State ──────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  registry: ModelRegistry
  timestamp: number
}

let memoryCache: CacheEntry | null = null

/** Whether a background fetch is already in flight. */
let fetchInFlight = false

// ── Path Helpers ─────────────────────────────────────────────────

const LOCAL_REGISTRY_PATH = join(homedir(), '.claude', 'models.json')
const REMOTE_CACHE_PATH = join(homedir(), '.claude', 'cache', 'model-registry.json')

const DEFAULT_REGISTRY_URL = 'https://models.dev/api/models'

// ── Lookup Index ─────────────────────────────────────────────────
// Built lazily from the active registry for O(1) model lookups.

let lookupIndex: Map<string, ModelEntry> | null = null
let lookupIndexSource: ModelRegistry | null = null

function buildLookupIndex(registry: ModelRegistry): Map<string, ModelEntry> {
  const map = new Map<string, ModelEntry>()
  for (const model of registry.models) {
    // Primary ID (exact)
    map.set(model.id, model)
    // Lowercase variant
    map.set(model.id.toLowerCase(), model)
    // Aliases
    if (model.aliases) {
      for (const alias of model.aliases) {
        map.set(alias, model)
        map.set(alias.toLowerCase(), model)
      }
    }
  }
  return map
}

function getIndex(registry: ModelRegistry): Map<string, ModelEntry> {
  if (lookupIndex && lookupIndexSource === registry) {
    return lookupIndex
  }
  lookupIndex = buildLookupIndex(registry)
  lookupIndexSource = registry
  return lookupIndex
}

// ── Registry Loading ─────────────────────────────────────────────

/**
 * Load the local user registry from ~/.claude/models.json.
 * Returns null if the file does not exist or is invalid.
 */
export function loadLocalRegistry(): ModelRegistry | null {
  try {
    if (!existsSync(LOCAL_REGISTRY_PATH)) {
      return null
    }
    const raw = readFileSync(LOCAL_REGISTRY_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return ModelRegistrySchema.parse(data)
  } catch (err) {
    logError(err)
    return null
  }
}

/**
 * Load the remote-fetched cache from ~/.claude/cache/model-registry.json.
 * Returns null if missing, expired, or invalid.
 */
function loadRemoteCache(): ModelRegistry | null {
  try {
    if (!existsSync(REMOTE_CACHE_PATH)) {
      return null
    }
    const raw = readFileSync(REMOTE_CACHE_PATH, 'utf-8')
    const wrapper = JSON.parse(raw) as { fetchedAt: number; registry: unknown }
    if (!wrapper.fetchedAt || !wrapper.registry) {
      return null
    }
    // Expire disk cache after 1 hour
    if (Date.now() - wrapper.fetchedAt > 60 * 60 * 1000) {
      return null
    }
    return ModelRegistrySchema.parse(wrapper.registry)
  } catch {
    return null
  }
}

/**
 * Save fetched registry to disk cache.
 */
function saveRemoteCache(registry: ModelRegistry): void {
  try {
    const dir = dirname(REMOTE_CACHE_PATH)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(
      REMOTE_CACHE_PATH,
      JSON.stringify({ fetchedAt: Date.now(), registry }, null, 2),
      'utf-8',
    )
  } catch {
    // Best-effort; ignore write failures
  }
}

// ── Active Registry Resolution ───────────────────────────────────

/**
 * Get the active registry using the layered resolution:
 *   memory cache -> local file -> remote disk cache -> fallback
 *
 * This is synchronous and safe for hot paths.
 */
function getActiveRegistry(): ModelRegistry {
  // 1. In-memory cache (if fresh)
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache.registry
  }

  // 2. Local user file (~/.claude/models.json)
  const local = loadLocalRegistry()
  if (local) {
    memoryCache = { registry: local, timestamp: Date.now() }
    return local
  }

  // 3. Remote disk cache (~/.claude/cache/model-registry.json)
  const remoteCached = loadRemoteCache()
  if (remoteCached) {
    memoryCache = { registry: remoteCached, timestamp: Date.now() }
    return remoteCached
  }

  // 4. Hardcoded fallback
  memoryCache = { registry: FALLBACK_REGISTRY, timestamp: Date.now() }
  return FALLBACK_REGISTRY
}

// ── Remote Fetch ─────────────────────────────────────────────────

/**
 * Fetch model registry from a remote URL.
 * Validates the response with Zod before returning.
 *
 * This is async and intended for background updates only.
 */
export async function fetchModelRegistry(
  url: string = DEFAULT_REGISTRY_URL,
): Promise<ModelRegistry> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`)
  }
  const data = await response.json()
  return ModelRegistrySchema.parse(data)
}

/**
 * Fire-and-forget background refresh of the model registry.
 * Called on first use; does not block the caller.
 */
function triggerBackgroundFetch(): void {
  if (fetchInFlight) return
  fetchInFlight = true

  fetchModelRegistry()
    .then((registry) => {
      memoryCache = { registry, timestamp: Date.now() }
      lookupIndex = null // invalidate index so it rebuilds
      lookupIndexSource = null
      saveRemoteCache(registry)
    })
    .catch((err) => {
      // Network failures are expected (offline, DNS, etc.) — log and move on
      logError(err)
    })
    .finally(() => {
      fetchInFlight = false
    })
}

// ── Cached Registry ──────────────────────────────────────────────

/**
 * Return the cached registry (in-memory, 5-minute TTL).
 * Kicks off a background fetch on first call.
 * Always returns synchronously using cached/fallback data.
 */
export function getCachedRegistry(): ModelRegistry {
  const registry = getActiveRegistry()

  // Trigger a background refresh if we haven't fetched yet
  if (!fetchInFlight && memoryCache?.registry === FALLBACK_REGISTRY) {
    triggerBackgroundFetch()
  }

  return registry
}

// ── Model Lookup ─────────────────────────────────────────────────

/**
 * Look up a model by ID or alias.
 *
 * Resolution order:
 *   1. Exact match in the active registry
 *   2. Case-insensitive match
 *   3. Match via matchPattern (regex) for OpenAI-compatible models
 *
 * Returns undefined if the model is not found.
 */
export function getModelEntry(modelId: string): ModelEntry | undefined {
  const registry = getCachedRegistry()
  const index = getIndex(registry)

  // Exact or alias match (includes lowercase)
  const direct = index.get(modelId) ?? index.get(modelId.toLowerCase())
  if (direct) return direct

  // Regex-based match for OpenAI-compatible models
  for (const model of registry.models) {
    if (model.matchPattern) {
      try {
        const re = new RegExp(model.matchPattern, 'i')
        if (re.test(modelId)) return model
      } catch {
        // Invalid regex in registry — skip
      }
    }
  }

  return undefined
}

// ── Convenience Accessors ────────────────────────────────────────

/**
 * Return the context window for a model.
 * Returns undefined if the model is not in the registry.
 */
export function getRegistryContextWindow(modelId: string): number | undefined {
  return getModelEntry(modelId)?.contextWindow
}

/**
 * Return the max output tokens for a model.
 * Returns undefined if the model is not in the registry.
 */
export function getRegistryMaxOutputTokens(modelId: string): number | undefined {
  return getModelEntry(modelId)?.maxOutputTokens
}

/**
 * Return the capabilities object for a model.
 * Returns undefined if the model is not in the registry.
 */
export function getRegistryCapabilities(modelId: string): ModelCapabilities | undefined {
  return getModelEntry(modelId)?.capabilities
}

// ── Testing Helpers ──────────────────────────────────────────────

/**
 * Reset in-memory cache. Intended for tests only.
 */
export function _resetCache(): void {
  memoryCache = null
  lookupIndex = null
  lookupIndexSource = null
  fetchInFlight = false
}
