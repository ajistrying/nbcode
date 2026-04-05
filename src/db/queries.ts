/**
 * Type-safe database queries for session management.
 *
 * These provide a clean API over the raw Drizzle schema.
 * Each function is a self-contained query — no shared state.
 */

import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { getDb } from './database.js'
import {
  agentMetadata,
  remoteAgentMetadata,
  sessionPrLinks,
  sessions,
  sessionStats,
  sessionWorktreeState,
} from './schema.js'

// ─── Sessions ───────────────────────────────────────────

export type SessionRow = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export function upsertSession(session: NewSession): void {
  const db = getDb()
  db.insert(sessions)
    .values(session)
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        customTitle: session.customTitle,
        aiTitle: session.aiTitle,
        tag: session.tag,
        firstPrompt: session.firstPrompt,
        lastPrompt: session.lastPrompt,
        summary: session.summary,
        agentName: session.agentName,
        agentColor: session.agentColor,
        agentSetting: session.agentSetting,
        mode: session.mode,
        transcriptPath: session.transcriptPath,
        messageCount: session.messageCount,
        updatedAt: new Date(),
      },
    })
    .run()
}

export function getSession(sessionId: string): SessionRow | undefined {
  const db = getDb()
  return db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
}

export function listSessions(
  projectDir: string,
  limit: number = 100,
): SessionRow[] {
  const db = getDb()
  return db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.projectDir, projectDir), eq(sessions.isSidechain, false)),
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(limit)
    .all()
}

export function listAllSessions(limit: number = 100): SessionRow[] {
  const db = getDb()
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.isSidechain, false))
    .orderBy(desc(sessions.updatedAt))
    .limit(limit)
    .all()
}

export function searchSessions(
  query: string,
  projectDir?: string,
): SessionRow[] {
  const db = getDb()
  const pattern = `%${query}%`
  const searchCondition = or(
    like(sessions.customTitle, pattern),
    like(sessions.aiTitle, pattern),
    like(sessions.tag, pattern),
    like(sessions.firstPrompt, pattern),
  )

  if (projectDir) {
    return db
      .select()
      .from(sessions)
      .where(and(eq(sessions.projectDir, projectDir), searchCondition))
      .orderBy(desc(sessions.updatedAt))
      .all()
  }

  return db
    .select()
    .from(sessions)
    .where(searchCondition)
    .orderBy(desc(sessions.updatedAt))
    .all()
}

export function updateSessionTitle(
  sessionId: string,
  title: string,
  source: 'user' | 'ai' = 'user',
): void {
  const db = getDb()
  const field = source === 'ai' ? { aiTitle: title } : { customTitle: title }
  db.update(sessions)
    .set({ ...field, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .run()
}

export function updateSessionTag(sessionId: string, tag: string): void {
  const db = getDb()
  db.update(sessions)
    .set({ tag, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .run()
}

export function updateSessionMessageCount(
  sessionId: string,
  count: number,
): void {
  const db = getDb()
  db.update(sessions)
    .set({ messageCount: count, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .run()
}

export function updateSessionPrompts(
  sessionId: string,
  opts: { firstPrompt?: string; lastPrompt?: string },
): void {
  const db = getDb()
  db.update(sessions)
    .set({ ...opts, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .run()
}

export function deleteSession(sessionId: string): void {
  const db = getDb()
  db.delete(sessions).where(eq(sessions.id, sessionId)).run()
}

export function sessionExists(sessionId: string): boolean {
  const db = getDb()
  const result = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get()
  return result !== undefined
}

// ─── Session Stats ──────────────────────────────────────

export type StatsRow = typeof sessionStats.$inferSelect

export function upsertSessionStats(stats: typeof sessionStats.$inferInsert): void {
  const db = getDb()
  db.insert(sessionStats)
    .values(stats)
    .onConflictDoUpdate({
      target: sessionStats.sessionId,
      set: {
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheReadTokens: stats.cacheReadTokens,
        cacheWriteTokens: stats.cacheWriteTokens,
        costUsd: stats.costUsd,
        apiDurationMs: stats.apiDurationMs,
        toolDurationMs: stats.toolDurationMs,
        modelUsage: stats.modelUsage,
        updatedAt: new Date(),
      },
    })
    .run()
}

export function getSessionStats(sessionId: string): StatsRow | undefined {
  const db = getDb()
  return db
    .select()
    .from(sessionStats)
    .where(eq(sessionStats.sessionId, sessionId))
    .get()
}

export function getTotalCostAllSessions(): number {
  const db = getDb()
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(cost_usd), 0)` })
    .from(sessionStats)
    .get()
  return result?.total ?? 0
}

// ─── PR Links ───────────────────────────────────────────

export function linkSessionToPr(
  sessionId: string,
  prNumber: number,
  prUrl: string,
  prRepository: string,
): void {
  const db = getDb()
  db.insert(sessionPrLinks)
    .values({ sessionId, prNumber, prUrl, prRepository })
    .onConflictDoUpdate({
      target: sessionPrLinks.sessionId,
      set: { prNumber, prUrl, prRepository, linkedAt: new Date() },
    })
    .run()
}

export function getSessionPrLink(
  sessionId: string,
): typeof sessionPrLinks.$inferSelect | undefined {
  const db = getDb()
  return db
    .select()
    .from(sessionPrLinks)
    .where(eq(sessionPrLinks.sessionId, sessionId))
    .get()
}

// ─── Worktree State ─────────────────────────────────────

export function upsertWorktreeState(
  state: typeof sessionWorktreeState.$inferInsert,
): void {
  const db = getDb()
  db.insert(sessionWorktreeState)
    .values(state)
    .onConflictDoUpdate({
      target: sessionWorktreeState.sessionId,
      set: state,
    })
    .run()
}

export function deleteWorktreeState(sessionId: string): void {
  const db = getDb()
  db.delete(sessionWorktreeState)
    .where(eq(sessionWorktreeState.sessionId, sessionId))
    .run()
}

export function getWorktreeState(
  sessionId: string,
): typeof sessionWorktreeState.$inferSelect | undefined {
  const db = getDb()
  return db
    .select()
    .from(sessionWorktreeState)
    .where(eq(sessionWorktreeState.sessionId, sessionId))
    .get()
}

// ─── Agent Metadata ─────────────────────────────────────

export function upsertAgentMeta(
  meta: typeof agentMetadata.$inferInsert,
): void {
  const db = getDb()
  db.insert(agentMetadata)
    .values(meta)
    .onConflictDoUpdate({
      target: agentMetadata.agentId,
      set: meta,
    })
    .run()
}

export function getAgentMeta(
  agentId: string,
): typeof agentMetadata.$inferSelect | undefined {
  const db = getDb()
  return db
    .select()
    .from(agentMetadata)
    .where(eq(agentMetadata.agentId, agentId))
    .get()
}

// ─── Remote Agent Metadata ──────────────────────────────

export function upsertRemoteAgentMeta(
  meta: typeof remoteAgentMetadata.$inferInsert,
): void {
  const db = getDb()
  db.insert(remoteAgentMetadata)
    .values(meta)
    .onConflictDoUpdate({
      target: remoteAgentMetadata.taskId,
      set: meta,
    })
    .run()
}

export function getRemoteAgentMeta(
  taskId: string,
): typeof remoteAgentMetadata.$inferSelect | undefined {
  const db = getDb()
  return db
    .select()
    .from(remoteAgentMetadata)
    .where(eq(remoteAgentMetadata.taskId, taskId))
    .get()
}

export function deleteRemoteAgentMeta(taskId: string): void {
  const db = getDb()
  db.delete(remoteAgentMetadata)
    .where(eq(remoteAgentMetadata.taskId, taskId))
    .run()
}

export function listRemoteAgentMeta(): (typeof remoteAgentMetadata.$inferSelect)[] {
  const db = getDb()
  return db.select().from(remoteAgentMetadata).all()
}
