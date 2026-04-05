/**
 * SQLite database connection for session indexing and metadata.
 *
 * Uses Bun's built-in SQLite with Drizzle ORM for type-safe queries.
 * Database location: ~/.claude/db/sessions.db (alongside existing project data)
 *
 * Optimized for CLI use:
 * - WAL mode for concurrent read/write
 * - 64MB cache for fast repeated queries
 * - busy_timeout for graceful lock handling
 * - Synchronous NORMAL for speed (WAL protects against corruption)
 */

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import * as schema from './schema.js'
import { logError } from '../utils/log.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null
let rawDb: Database | null = null

function getDbPath(): string {
  const claudeDir = join(
    process.env.HOME ?? process.env.USERPROFILE ?? '.',
    '.claude',
  )
  const dbDir = join(claudeDir, 'db')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true, mode: 0o700 })
  }
  return join(dbDir, 'sessions.db')
}

function createMigrations(db: Database): void {
  // Run migrations inline — simpler than external migration files for an embedded DB.
  // The user_version pragma tracks which migrations have been applied.
  const version = db.query('PRAGMA user_version').get() as {
    user_version: number
  }
  const currentVersion = version.user_version

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_dir TEXT NOT NULL,
        project_path TEXT,
        parent_session_id TEXT,
        custom_title TEXT,
        ai_title TEXT,
        tag TEXT,
        first_prompt TEXT,
        last_prompt TEXT,
        summary TEXT,
        agent_name TEXT,
        agent_color TEXT,
        agent_setting TEXT,
        mode TEXT,
        transcript_path TEXT,
        is_sidechain INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project_dir ON sessions(project_dir);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_custom_title ON sessions(custom_title);
      CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);

      CREATE TABLE IF NOT EXISTS session_stats (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id),
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        api_duration_ms INTEGER DEFAULT 0,
        tool_duration_ms INTEGER DEFAULT 0,
        model_usage TEXT,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS session_pr_links (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id),
        pr_number INTEGER,
        pr_url TEXT,
        pr_repository TEXT,
        linked_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS session_worktree_state (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id),
        original_cwd TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        worktree_name TEXT NOT NULL,
        worktree_branch TEXT,
        original_branch TEXT,
        original_head_commit TEXT,
        tmux_session_name TEXT,
        hook_based INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_metadata (
        agent_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        agent_type TEXT NOT NULL,
        worktree_path TEXT,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_metadata (
        task_id TEXT PRIMARY KEY,
        remote_task_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        command TEXT NOT NULL,
        spawned_at INTEGER NOT NULL,
        tool_use_id TEXT,
        is_long_running INTEGER,
        is_ultraplan INTEGER,
        is_remote_review INTEGER,
        metadata TEXT
      );

      PRAGMA user_version = 1;
    `)
  }
}

/**
 * Get the Drizzle ORM database instance (singleton).
 * Lazy-initialized on first call.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) {
    return dbInstance
  }

  try {
    const dbPath = getDbPath()
    rawDb = new Database(dbPath)

    // Optimize for CLI use
    rawDb.exec('PRAGMA journal_mode = WAL')
    rawDb.exec('PRAGMA cache_size = -65536') // 64MB
    rawDb.exec('PRAGMA synchronous = NORMAL')
    rawDb.exec('PRAGMA busy_timeout = 5000')
    rawDb.exec('PRAGMA foreign_keys = ON')

    // Run migrations
    createMigrations(rawDb)

    dbInstance = drizzle(rawDb, { schema })

    // Register cleanup so DB closes on graceful shutdown
    registerCleanup(async () => closeDb())

    return dbInstance
  } catch (error) {
    logError(error)
    throw error
  }
}

/**
 * Close the database connection. Call on process exit.
 */
export function closeDb(): void {
  if (rawDb) {
    try {
      rawDb.close()
    } catch {
      // Ignore close errors during shutdown
    }
    rawDb = null
    dbInstance = null
  }
}

/**
 * Get the raw Bun SQLite database (for advanced queries or testing).
 */
export function getRawDb(): Database | null {
  return rawDb
}
