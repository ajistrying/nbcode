/**
 * Session Indexer — keeps SQLite index in sync with JSONL sessions.
 *
 * This is a write-through cache: every time sessionStorage writes metadata,
 * we also update the SQLite index. The JSONL files remain the source of truth.
 * SQLite provides fast querying and search.
 *
 * Integration points (called from sessionStorage.ts):
 * - indexSession() — when a session file is materialized
 * - indexTitle() — when saveCustomTitle/saveAiGeneratedTitle is called
 * - indexTag() — when saveTag is called
 * - indexStats() — when cost/token data is available (end of API call)
 * - indexPrLink() — when linkSessionToPR is called
 *
 * All operations are fire-and-forget — failures are logged but never
 * block the main persistence path.
 */

import { logError } from '../utils/log.js'
import {
  getSession,
  linkSessionToPr,
  updateSessionMessageCount,
  updateSessionPrompts,
  updateSessionTag,
  updateSessionTitle,
  upsertSession,
  upsertSessionStats,
} from './queries.js'

/**
 * Index a new or updated session. Called when the session file is materialized.
 */
export function indexSession(opts: {
  sessionId: string
  projectDir: string
  projectPath?: string
  parentSessionId?: string
  transcriptPath?: string
  isSidechain?: boolean
  customTitle?: string
  tag?: string
  agentName?: string
  agentColor?: string
  agentSetting?: string
  mode?: string
}): void {
  try {
    upsertSession({
      id: opts.sessionId,
      projectDir: opts.projectDir,
      projectPath: opts.projectPath,
      parentSessionId: opts.parentSessionId,
      transcriptPath: opts.transcriptPath,
      isSidechain: opts.isSidechain ?? false,
      customTitle: opts.customTitle,
      tag: opts.tag,
      agentName: opts.agentName,
      agentColor: opts.agentColor,
      agentSetting: opts.agentSetting,
      mode: opts.mode,
    })
  } catch (error) {
    logError(error)
  }
}

/**
 * Update session title in the index.
 */
export function indexTitle(
  sessionId: string,
  title: string,
  source: 'user' | 'ai' = 'user',
): void {
  try {
    // Ensure session exists first
    if (!getSession(sessionId)) return
    updateSessionTitle(sessionId, title, source)
  } catch (error) {
    logError(error)
  }
}

/**
 * Update session tag in the index.
 */
export function indexTag(sessionId: string, tag: string): void {
  try {
    if (!getSession(sessionId)) return
    updateSessionTag(sessionId, tag)
  } catch (error) {
    logError(error)
  }
}

/**
 * Update session prompts in the index.
 */
export function indexPrompts(
  sessionId: string,
  opts: { firstPrompt?: string; lastPrompt?: string },
): void {
  try {
    if (!getSession(sessionId)) return
    updateSessionPrompts(sessionId, opts)
  } catch (error) {
    logError(error)
  }
}

/**
 * Update message count in the index.
 */
export function indexMessageCount(
  sessionId: string,
  count: number,
): void {
  try {
    if (!getSession(sessionId)) return
    updateSessionMessageCount(sessionId, count)
  } catch (error) {
    logError(error)
  }
}

/**
 * Update session cost/token stats in the index.
 */
export function indexStats(opts: {
  sessionId: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
  apiDurationMs?: number
  toolDurationMs?: number
  modelUsage?: Record<string, unknown>
}): void {
  try {
    upsertSessionStats({
      sessionId: opts.sessionId,
      inputTokens: opts.inputTokens ?? 0,
      outputTokens: opts.outputTokens ?? 0,
      cacheReadTokens: opts.cacheReadTokens ?? 0,
      cacheWriteTokens: opts.cacheWriteTokens ?? 0,
      costUsd: opts.costUsd ?? 0,
      apiDurationMs: opts.apiDurationMs ?? 0,
      toolDurationMs: opts.toolDurationMs ?? 0,
      modelUsage: opts.modelUsage,
    })
  } catch (error) {
    logError(error)
  }
}

/**
 * Index a PR link for a session.
 */
export function indexPrLink(
  sessionId: string,
  prNumber: number,
  prUrl: string,
  prRepository: string,
): void {
  try {
    linkSessionToPr(sessionId, prNumber, prUrl, prRepository)
  } catch (error) {
    logError(error)
  }
}
