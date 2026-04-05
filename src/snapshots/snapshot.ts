/**
 * Shadow Git Snapshot System
 *
 * Maintains a separate git repository to track file changes made by the agent.
 * Snapshots are taken before file-modifying tool executions, enabling undo.
 *
 * Storage: <projectRoot>/.nbcode/snapshots/ (shadow git repo)
 * Max file size: 2MB (skip large binaries)
 * Pruning: snapshots older than 7 days are auto-cleaned
 */

import { execFile } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SNAPSHOT_DIR_NAME = '.nbcode/snapshots'
const MANIFEST_FILE = 'snapshots.json'

export interface Snapshot {
  id: string
  timestamp: number
  description: string
  files: string[] // relative paths from project root
  commitHash: string
}

interface SnapshotManifest {
  snapshots: Snapshot[]
}

function getSnapshotDir(projectRoot: string): string {
  return join(projectRoot, SNAPSHOT_DIR_NAME)
}

function getManifestPath(projectRoot: string): string {
  return join(getSnapshotDir(projectRoot), MANIFEST_FILE)
}

function readManifest(projectRoot: string): SnapshotManifest {
  const manifestPath = getManifestPath(projectRoot)
  if (!existsSync(manifestPath)) {
    return { snapshots: [] }
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return { snapshots: [] }
  }
}

function writeManifest(
  projectRoot: string,
  manifest: SnapshotManifest,
): void {
  const manifestPath = getManifestPath(projectRoot)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

async function gitInShadow(
  projectRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const shadowDir = getSnapshotDir(projectRoot)
  return execFileAsync('git', args, {
    cwd: shadowDir,
    env: {
      ...process.env,
      // Prevent interference with user's git config
      GIT_DIR: join(shadowDir, '.git'),
      GIT_WORK_TREE: shadowDir,
    },
  })
}

/**
 * Initialize the shadow git repo if it doesn't exist.
 */
export async function initSnapshotRepo(projectRoot: string): Promise<void> {
  const shadowDir = getSnapshotDir(projectRoot)
  const gitDir = join(shadowDir, '.git')

  if (existsSync(gitDir)) {
    return // Already initialized
  }

  mkdirSync(shadowDir, { recursive: true })
  await gitInShadow(projectRoot, ['init', '-q'])
  await gitInShadow(projectRoot, [
    'config',
    'user.email',
    'nbcode-snapshots@local',
  ])
  await gitInShadow(projectRoot, [
    'config',
    'user.name',
    'nbcode-snapshots',
  ])

  // Initial empty commit so we always have a base
  writeFileSync(join(shadowDir, '.gitkeep'), '')
  await gitInShadow(projectRoot, ['add', '.gitkeep'])
  await gitInShadow(projectRoot, ['commit', '-q', '-m', 'init snapshot repo'])
}

/**
 * Copy files from the project into the shadow repo and commit a snapshot.
 * Only copies files that exist and are under the size limit.
 */
export async function takeSnapshot(
  projectRoot: string,
  filePaths: string[],
  description: string,
): Promise<Snapshot | null> {
  if (filePaths.length === 0) {
    return null
  }

  await initSnapshotRepo(projectRoot)
  const shadowDir = getSnapshotDir(projectRoot)

  const copiedFiles: string[] = []

  for (const filePath of filePaths) {
    const absPath = resolve(projectRoot, filePath)
    const relPath = relative(projectRoot, absPath)

    // Skip if outside project root
    if (relPath.startsWith('..')) {
      continue
    }

    // Skip if file doesn't exist (it's a new file being created)
    if (!existsSync(absPath)) {
      // For new files, record that the file didn't exist (so undo can delete it)
      const shadowPath = join(shadowDir, 'files', relPath)
      const shadowPathDir = dirname(shadowPath)
      mkdirSync(shadowPathDir, { recursive: true })
      // Write a sentinel marker for "file did not exist"
      writeFileSync(shadowPath + '.__new__', '')
      copiedFiles.push(relPath)
      continue
    }

    try {
      const stat = statSync(absPath)
      if (stat.size > MAX_FILE_SIZE) {
        continue // Skip large files
      }
    } catch {
      continue
    }

    // Copy file into shadow repo
    const shadowPath = join(shadowDir, 'files', relPath)
    const shadowPathDir = dirname(shadowPath)
    mkdirSync(shadowPathDir, { recursive: true })

    try {
      copyFileSync(absPath, shadowPath)
      copiedFiles.push(relPath)
    } catch {
      // Skip files we can't read
    }
  }

  if (copiedFiles.length === 0) {
    return null
  }

  // Stage and commit in shadow repo
  try {
    await gitInShadow(projectRoot, ['add', '-A'])
    const timestamp = Date.now()
    const id = `snap_${timestamp}`
    const commitMsg = `${id}: ${description}`
    await gitInShadow(projectRoot, ['commit', '-q', '-m', commitMsg, '--allow-empty'])

    const { stdout } = await gitInShadow(projectRoot, [
      'rev-parse',
      'HEAD',
    ])
    const commitHash = stdout.trim()

    const snapshot: Snapshot = {
      id,
      timestamp,
      description,
      files: copiedFiles,
      commitHash,
    }

    // Update manifest
    const manifest = readManifest(projectRoot)
    manifest.snapshots.push(snapshot)
    writeManifest(projectRoot, manifest)

    return snapshot
  } catch {
    return null
  }
}

/**
 * Restore files from a snapshot. Copies files from the shadow repo back
 * into the project, and deletes files that were marked as new (didn't exist before).
 */
export async function restoreSnapshot(
  projectRoot: string,
  snapshotId: string,
): Promise<{ restored: string[]; deleted: string[] } | null> {
  const manifest = readManifest(projectRoot)
  const snapshot = manifest.snapshots.find((s) => s.id === snapshotId)

  if (!snapshot) {
    return null
  }

  const shadowDir = getSnapshotDir(projectRoot)

  // Checkout the snapshot's commit in the shadow repo
  try {
    await gitInShadow(projectRoot, ['checkout', snapshot.commitHash, '--', '.'])
  } catch {
    return null
  }

  const restored: string[] = []
  const deleted: string[] = []

  for (const relPath of snapshot.files) {
    const absPath = resolve(projectRoot, relPath)
    const shadowPath = join(shadowDir, 'files', relPath)
    const newMarker = shadowPath + '.__new__'

    if (existsSync(newMarker)) {
      // File didn't exist before — delete it from project
      if (existsSync(absPath)) {
        try {
          rmSync(absPath)
          deleted.push(relPath)
        } catch {
          // Can't delete, skip
        }
      }
    } else if (existsSync(shadowPath)) {
      // Restore from shadow copy
      const targetDir = dirname(absPath)
      mkdirSync(targetDir, { recursive: true })
      try {
        copyFileSync(shadowPath, absPath)
        restored.push(relPath)
      } catch {
        // Can't restore, skip
      }
    }
  }

  // Go back to latest in shadow repo
  try {
    await gitInShadow(projectRoot, ['checkout', 'HEAD', '--', '.'])
  } catch {
    // Non-fatal
  }

  return { restored, deleted }
}

/**
 * Undo the last N snapshots. Restores files from the Nth-from-last snapshot.
 */
export async function undoLastN(
  projectRoot: string,
  n: number = 1,
): Promise<{
  snapshot: Snapshot
  restored: string[]
  deleted: string[]
} | null> {
  const manifest = readManifest(projectRoot)
  const snapshots = manifest.snapshots

  if (snapshots.length === 0) {
    return null
  }

  // Get the snapshot N steps back (1 = last snapshot)
  const index = Math.max(0, snapshots.length - n)
  const snapshot = snapshots[index]
  if (!snapshot) {
    return null
  }

  const result = await restoreSnapshot(projectRoot, snapshot.id)
  if (!result) {
    return null
  }

  // Remove snapshots after the restored one
  manifest.snapshots = snapshots.slice(0, index)
  writeManifest(projectRoot, manifest)

  return { snapshot, ...result }
}

/**
 * List all snapshots, newest first.
 */
export function listSnapshots(projectRoot: string): Snapshot[] {
  const manifest = readManifest(projectRoot)
  return [...manifest.snapshots].reverse()
}

/**
 * Get the total number of snapshots available.
 */
export function getSnapshotCount(projectRoot: string): number {
  return readManifest(projectRoot).snapshots.length
}

/**
 * Remove snapshots older than PRUNE_AGE_MS.
 */
export async function pruneSnapshots(projectRoot: string): Promise<number> {
  const manifest = readManifest(projectRoot)
  const cutoff = Date.now() - PRUNE_AGE_MS
  const before = manifest.snapshots.length
  manifest.snapshots = manifest.snapshots.filter((s) => s.timestamp >= cutoff)
  const pruned = before - manifest.snapshots.length

  if (pruned > 0) {
    writeManifest(projectRoot, manifest)

    // Run git gc to clean up unreferenced objects
    try {
      await gitInShadow(projectRoot, ['gc', '--auto', '--quiet'])
    } catch {
      // Non-fatal
    }
  }

  return pruned
}
