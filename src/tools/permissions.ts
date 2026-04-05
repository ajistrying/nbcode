/**
 * Centralized permission helpers for tools.
 *
 * Common permission patterns extracted from existing tool implementations.
 * New tools (especially those using `defineSimpleTool`) can use these helpers
 * instead of reimplementing the same permission logic.
 *
 * Existing tools are unaffected --- this module is purely additive.
 */

import { normalize, resolve } from 'path'
import type {
  PermissionAllowDecision,
  PermissionAskDecision,
  PermissionResult,
} from '../types/permissions.js'
import { getCwd } from '../utils/cwd.js'
import { expandPath } from '../utils/path.js'

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * Check whether a file path is within the allowed working directories.
 *
 * Normalizes both the candidate path and the allowed directories before
 * comparison to avoid path-traversal bypasses (e.g. `../../etc/passwd`).
 *
 * @param filePath       The absolute or relative path to check.
 * @param cwd            The current working directory (primary allowed dir).
 * @param additionalDirs Extra directories that are also allowed.
 * @returns `true` when `filePath` resolves to a location inside one of the
 *          allowed directories.
 */
export function isPathAllowed(
  filePath: string,
  cwd: string,
  additionalDirs?: string[],
): boolean {
  const absolutePath = normalize(resolve(expandPath(filePath)))
  const dirs = [cwd, ...(additionalDirs ?? [])].map(d =>
    normalize(resolve(expandPath(d))),
  )

  return dirs.some(dir => {
    // Exact match (the directory itself) or a child path.
    return absolutePath === dir || absolutePath.startsWith(dir + '/')
  })
}

// ---------------------------------------------------------------------------
// Standard permission results
// ---------------------------------------------------------------------------

/**
 * Standard "allow" result for read-only tools.
 *
 * Read-only operations are generally safe and don't require explicit
 * user confirmation in the common case.
 */
export function allowReadOnly<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
>(input?: Input): PermissionAllowDecision<Input> {
  return {
    behavior: 'allow',
    updatedInput: input,
  }
}

/**
 * Standard permission result for tools that write to a file path.
 *
 * If the path is within the allowed working directories the write is
 * permitted via `passthrough` (so the general permission system still
 * applies its rules). Otherwise the user is prompted.
 *
 * @param filePath The absolute or relative path being written.
 * @param cwd      The current working directory.
 * @param additionalDirs Optional extra allowed directories.
 */
export function requireFileWritePermission(
  filePath: string,
  cwd: string,
  additionalDirs?: string[],
): PermissionResult {
  if (isPathAllowed(filePath, cwd, additionalDirs)) {
    return {
      behavior: 'passthrough',
      message: `Writing to ${filePath}`,
    }
  }

  return {
    behavior: 'ask',
    message: `Claude wants to write to ${filePath}, which is outside the current working directory (${cwd}). Allow?`,
  } satisfies PermissionAskDecision
}

/**
 * Standard permission result for potentially dangerous operations.
 *
 * Always prompts the user with a description of what the tool intends to do.
 *
 * @param description A human-readable explanation of the dangerous operation.
 */
export function requireDangerousPermission(
  description: string,
): PermissionAskDecision {
  return {
    behavior: 'ask',
    message: description,
  }
}
