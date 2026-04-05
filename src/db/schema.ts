/**
 * SQLite schema for session indexing and metadata.
 *
 * This is NOT a full replacement for JSONL transcripts.
 * JSONL remains the source of truth for message content.
 * SQLite provides fast querying, search, and metadata access.
 */

import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Session index — fast listing, search, and metadata without scanning files.
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // UUID
  projectDir: text('project_dir').notNull(),
  projectPath: text('project_path'), // original cwd
  parentSessionId: text('parent_session_id'),
  customTitle: text('custom_title'),
  aiTitle: text('ai_title'),
  tag: text('tag'),
  firstPrompt: text('first_prompt'),
  lastPrompt: text('last_prompt'),
  summary: text('summary'),
  agentName: text('agent_name'),
  agentColor: text('agent_color'),
  agentSetting: text('agent_setting'),
  mode: text('mode'), // 'coordinator' | 'normal'
  transcriptPath: text('transcript_path'), // path to JSONL file
  isSidechain: integer('is_sidechain', { mode: 'boolean' }).default(false),
  messageCount: integer('message_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
})

/**
 * Per-session cost and token tracking.
 * Currently this data is lost between sessions — SQLite preserves it.
 */
export const sessionStats = sqliteTable('session_stats', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  cacheWriteTokens: integer('cache_write_tokens').default(0),
  costUsd: real('cost_usd').default(0),
  apiDurationMs: integer('api_duration_ms').default(0),
  toolDurationMs: integer('tool_duration_ms').default(0),
  modelUsage: text('model_usage', { mode: 'json' }), // JSON: { [model]: { input, output, ... } }
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
})

/**
 * PR links for sessions.
 */
export const sessionPrLinks = sqliteTable('session_pr_links', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id),
  prNumber: integer('pr_number'),
  prUrl: text('pr_url'),
  prRepository: text('pr_repository'),
  linkedAt: integer('linked_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
})

/**
 * Worktree state for sessions that entered a worktree.
 */
export const sessionWorktreeState = sqliteTable('session_worktree_state', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id),
  originalCwd: text('original_cwd').notNull(),
  worktreePath: text('worktree_path').notNull(),
  worktreeName: text('worktree_name').notNull(),
  worktreeBranch: text('worktree_branch'),
  originalBranch: text('original_branch'),
  originalHeadCommit: text('original_head_commit'),
  tmuxSessionName: text('tmux_session_name'),
  hookBased: integer('hook_based', { mode: 'boolean' }),
})

/**
 * Agent metadata for subagent tracking.
 */
export const agentMetadata = sqliteTable('agent_metadata', {
  agentId: text('agent_id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  agentType: text('agent_type').notNull(),
  worktreePath: text('worktree_path'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
})

/**
 * Remote agent metadata (CCR tasks).
 */
export const remoteAgentMetadata = sqliteTable('remote_agent_metadata', {
  taskId: text('task_id').primaryKey(),
  remoteTaskType: text('remote_task_type').notNull(),
  sessionId: text('session_id').notNull(),
  title: text('title').notNull(),
  command: text('command').notNull(),
  spawnedAt: integer('spawned_at', { mode: 'timestamp_ms' }).notNull(),
  toolUseId: text('tool_use_id'),
  isLongRunning: integer('is_long_running', { mode: 'boolean' }),
  isUltraplan: integer('is_ultraplan', { mode: 'boolean' }),
  isRemoteReview: integer('is_remote_review', { mode: 'boolean' }),
  metadata: text('metadata', { mode: 'json' }),
})
