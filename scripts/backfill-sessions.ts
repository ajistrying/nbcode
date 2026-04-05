#!/usr/bin/env bun
/**
 * Backfill script: imports existing JSONL sessions into the SQLite index.
 *
 * Scans ~/.claude/projects/ for all *.jsonl session files, extracts metadata
 * from each via streaming line-by-line reads (memory-safe for GB-sized files),
 * and upserts each session into the SQLite database.
 *
 * Idempotent: running twice produces the same result.
 *
 * Usage:
 *   bun run scripts/backfill-sessions.ts
 */

import { readdirSync, existsSync, statSync, createReadStream } from 'fs'
import { join, basename, dirname } from 'path'
import { createInterface } from 'readline'
import { getDb, closeDb } from '../src/db/database.js'
import { upsertSession, linkSessionToPr } from '../src/db/queries.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

/**
 * Extract user-visible text from a message content field.
 * Content can be a string or an array of content blocks.
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        'type' in block &&
        block.type === 'text' &&
        'text' in block &&
        typeof block.text === 'string'
      ) {
        texts.push(block.text)
      }
    }
    return texts.join('\n')
  }
  return ''
}

/**
 * Truncate a string to a maximum length for DB storage.
 */
function truncate(s: string, max: number = 1000): string {
  return s.length <= max ? s : s.slice(0, max)
}

// ---------------------------------------------------------------------------
// Session metadata accumulator
// ---------------------------------------------------------------------------

interface SessionMeta {
  sessionId: string
  projectDir: string
  transcriptPath: string
  isSidechain: boolean
  customTitle?: string
  aiTitle?: string
  tag?: string
  agentName?: string
  agentColor?: string
  agentSetting?: string
  mode?: string
  firstPrompt?: string
  lastPrompt?: string
  messageCount: number
  prNumber?: number
  prUrl?: string
  prRepository?: string
  createdAt?: Date
  updatedAt?: Date
}

// ---------------------------------------------------------------------------
// JSONL file scanner
// ---------------------------------------------------------------------------

/**
 * Recursively collect all *.jsonl files under a directory.
 * Returns { filePath, sessionId, projectDir, isSidechain }.
 */
function collectJsonlFiles(
  projectsDir: string,
): Array<{
  filePath: string
  sessionId: string
  projectDir: string
  isSidechain: boolean
}> {
  const results: Array<{
    filePath: string
    sessionId: string
    projectDir: string
    isSidechain: boolean
  }> = []

  let projectDirents: ReturnType<typeof readdirSync>
  try {
    projectDirents = readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const projectDirent of projectDirents) {
    if (!projectDirent.isDirectory()) continue
    const projectDir = join(projectsDir, projectDirent.name)

    // Collect top-level *.jsonl files in this project dir
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(projectDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionId = basename(entry.name, '.jsonl')
        if (isUuid(sessionId)) {
          results.push({
            filePath: join(projectDir, entry.name),
            sessionId,
            projectDir,
            isSidechain: false,
          })
        }
      }
      // Scan session subdirectories for subagent files
      // Structure: <projectDir>/<sessionId>/subagents/**/*.jsonl
      if (entry.isDirectory() && isUuid(entry.name)) {
        const sessionSubDir = join(projectDir, entry.name)
        const subagentsDir = join(sessionSubDir, 'subagents')
        if (existsSync(subagentsDir)) {
          collectSubagentFiles(subagentsDir, projectDir, results)
        }
      }
    }
  }

  return results
}

/**
 * Recursively collect *.jsonl files from subagents/ directories.
 * These are sidechain sessions.
 */
function collectSubagentFiles(
  dir: string,
  projectDir: string,
  results: Array<{
    filePath: string
    sessionId: string
    projectDir: string
    isSidechain: boolean
  }>,
): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      // Agent files are named agent-<id>.jsonl — extract a usable ID
      const rawName = basename(entry.name, '.jsonl')
      // Use the raw name as the session ID (it may not be a UUID for agent files)
      // but still check if it looks like a UUID
      const sessionId = rawName.startsWith('agent-')
        ? rawName.slice(6)
        : rawName
      if (isUuid(sessionId)) {
        results.push({
          filePath: fullPath,
          sessionId,
          projectDir,
          isSidechain: true,
        })
      }
    } else if (entry.isDirectory()) {
      collectSubagentFiles(fullPath, projectDir, results)
    }
  }
}

// ---------------------------------------------------------------------------
// Stream-parse a single JSONL file
// ---------------------------------------------------------------------------

async function parseSessionFile(
  filePath: string,
  sessionId: string,
  projectDir: string,
  isSidechain: boolean,
): Promise<SessionMeta> {
  const meta: SessionMeta = {
    sessionId,
    projectDir,
    transcriptPath: filePath,
    isSidechain,
    messageCount: 0,
  }

  // Use file stat for created/updated timestamps
  try {
    const st = statSync(filePath)
    meta.createdAt = st.birthtime
    meta.updatedAt = st.mtime
  } catch {
    // Ignore — defaults will be used
  }

  // Track first user prompt separately (first-wins)
  let hasFirstPrompt = false

  const stream = createReadStream(filePath, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue

    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line)
    } catch {
      // Malformed line — skip
      continue
    }

    const entryType = entry.type as string | undefined

    // Detect sidechain from first message's isSidechain flag
    if (entry.isSidechain === true) {
      meta.isSidechain = true
    }

    // Metadata entries — last-wins semantics
    switch (entryType) {
      case 'custom-title':
        if (typeof entry.customTitle === 'string') {
          meta.customTitle = entry.customTitle
        }
        break

      case 'ai-title':
        if (typeof entry.aiTitle === 'string') {
          meta.aiTitle = entry.aiTitle
        }
        break

      case 'tag':
        if (typeof entry.tag === 'string') {
          meta.tag = entry.tag
        }
        break

      case 'agent-name':
        if (typeof entry.agentName === 'string') {
          meta.agentName = entry.agentName
        }
        break

      case 'agent-color':
        if (typeof entry.agentColor === 'string') {
          meta.agentColor = entry.agentColor
        }
        break

      case 'agent-setting':
        if (typeof entry.agentSetting === 'string') {
          meta.agentSetting = entry.agentSetting
        }
        break

      case 'mode':
        if (typeof entry.mode === 'string') {
          meta.mode = entry.mode
        }
        break

      case 'pr-link':
        if (typeof entry.prNumber === 'number') meta.prNumber = entry.prNumber
        if (typeof entry.prUrl === 'string') meta.prUrl = entry.prUrl
        if (typeof entry.prRepository === 'string')
          meta.prRepository = entry.prRepository
        break

      case 'user': {
        // Count user messages
        meta.messageCount++

        // Skip tool_result user messages (they are not real user prompts)
        const message = entry.message as Record<string, unknown> | undefined
        if (!message) break
        const content = message.content
        // Skip if content is an array containing tool_result blocks
        if (Array.isArray(content)) {
          const hasToolResult = content.some(
            (b: unknown) =>
              b &&
              typeof b === 'object' &&
              'type' in (b as Record<string, unknown>) &&
              (b as Record<string, unknown>).type === 'tool_result',
          )
          if (hasToolResult) break
        }
        // Skip meta-flagged user messages
        if (entry.isMeta === true) break

        const text = extractTextFromContent(content)
        if (text) {
          if (!hasFirstPrompt) {
            meta.firstPrompt = truncate(text)
            hasFirstPrompt = true
          }
          // Last-wins for lastPrompt
          meta.lastPrompt = truncate(text)
        }
        break
      }

      case 'assistant':
        // Count assistant messages
        meta.messageCount++
        break

      case 'last-prompt':
        // Authoritative last-prompt entry written by the app
        if (typeof entry.lastPrompt === 'string') {
          meta.lastPrompt = truncate(entry.lastPrompt)
        }
        break

      default:
        break
    }
  }

  return meta
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const claudeDir =
    process.env.CLAUDE_CONFIG_DIR ??
    join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.claude')
  const projectsDir = join(claudeDir, 'projects')

  if (!existsSync(projectsDir)) {
    console.log(
      `No projects directory found at ${projectsDir} — nothing to backfill.`,
    )
    process.exit(0)
  }

  console.log(`Scanning ${projectsDir} for JSONL session files...`)

  const files = collectJsonlFiles(projectsDir)
  if (files.length === 0) {
    console.log('No session files found.')
    process.exit(0)
  }

  console.log(`Found ${files.length} session file(s). Indexing...`)

  // Ensure DB is initialized before processing
  getDb()

  let indexed = 0
  let skipped = 0
  const projectsSeen = new Set<string>()

  for (const file of files) {
    try {
      const meta = await parseSessionFile(
        file.filePath,
        file.sessionId,
        file.projectDir,
        file.isSidechain,
      )

      projectsSeen.add(meta.projectDir)

      // Upsert the session
      upsertSession({
        id: meta.sessionId,
        projectDir: meta.projectDir,
        customTitle: meta.customTitle ?? meta.aiTitle,
        aiTitle: meta.aiTitle,
        tag: meta.tag,
        firstPrompt: meta.firstPrompt,
        lastPrompt: meta.lastPrompt,
        agentName: meta.agentName,
        agentColor: meta.agentColor,
        agentSetting: meta.agentSetting,
        mode: meta.mode,
        transcriptPath: meta.transcriptPath,
        isSidechain: meta.isSidechain,
        messageCount: meta.messageCount,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      })

      // Link PR if present
      if (meta.prNumber && meta.prUrl && meta.prRepository) {
        linkSessionToPr(
          meta.sessionId,
          meta.prNumber,
          meta.prUrl,
          meta.prRepository,
        )
      }

      indexed++

      // Progress indicator every 50 sessions
      if (indexed % 50 === 0) {
        console.log(`  ...indexed ${indexed}/${files.length} sessions`)
      }
    } catch (error) {
      skipped++
      console.warn(
        `  Warning: failed to process ${file.filePath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  closeDb()

  console.log(
    `\nDone. Indexed ${indexed} session(s) from ${projectsSeen.size} project(s).`,
  )
  if (skipped > 0) {
    console.log(`Skipped ${skipped} file(s) due to errors.`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  closeDb()
  process.exit(1)
})
