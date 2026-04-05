/**
 * Framework-agnostic permission queue handler.
 *
 * Extracts the tool permission queue management logic from REPL.tsx's
 * `toolUseConfirmQueue` state and the `setToolPermissionContext` callback.
 *
 * All functions are pure: they take the current queue + an action and return
 * a new queue. No React imports, no setState calls. The caller (REPL.tsx
 * today, headless runner tomorrow) applies the returned state.
 *
 * The existing `PermissionQueueOps` interface in
 * `hooks/toolPermission/PermissionContext.ts` defines the push/remove/update
 * contract used by `useCanUseTool`. This module provides the underlying
 * pure logic that backs those operations, plus higher-level helpers for
 * response processing and batch rechecking.
 */

import type { ToolUseConfirm } from '../../components/permissions/PermissionRequest.js'
import type { ToolPermissionContext } from '../../Tool.js'

// ---------------------------------------------------------------------------
// Queue operations: pure functions over ToolUseConfirm[]
// ---------------------------------------------------------------------------

/**
 * Add a permission request to the end of the queue.
 * Duplicate toolUseIDs are silently ignored (idempotent enqueue).
 */
export function enqueuePermissionRequest(
  queue: readonly ToolUseConfirm[],
  request: ToolUseConfirm,
): ToolUseConfirm[] {
  if (queue.some(item => item.toolUseID === request.toolUseID)) {
    return queue as ToolUseConfirm[]
  }
  return [...queue, request]
}

/**
 * Remove the first (frontmost) item from the queue.
 * This is the standard "user responded to the dialog" path — the
 * PermissionRequest component calls `onDone` which dequeues head.
 */
export function dequeueHead(
  queue: readonly ToolUseConfirm[],
): ToolUseConfirm[] {
  if (queue.length === 0) return []
  return queue.slice(1)
}

/**
 * Remove a specific item by toolUseID.
 * Used when a permission is resolved by a hook, classifier, or abort
 * rather than by the user interacting with the dialog.
 */
export function removeByToolUseId(
  queue: readonly ToolUseConfirm[],
  toolUseID: string,
): ToolUseConfirm[] {
  return queue.filter(item => item.toolUseID !== toolUseID)
}

/**
 * Update a specific item in the queue by toolUseID.
 * Used to patch classifier results or interaction flags onto an
 * already-queued item.
 */
export function updateQueueItem(
  queue: readonly ToolUseConfirm[],
  toolUseID: string,
  patch: Partial<ToolUseConfirm>,
): ToolUseConfirm[] {
  return queue.map(item =>
    item.toolUseID === toolUseID ? { ...item, ...patch } : item,
  )
}

/**
 * Clear the entire queue. Used on abort/reset.
 */
export function clearQueue(): ToolUseConfirm[] {
  return []
}

// ---------------------------------------------------------------------------
// Permission response processing
// ---------------------------------------------------------------------------

/**
 * Describes the user's response to a permission dialog.
 */
export type PermissionResponse = {
  /** Whether the user approved or rejected the tool use. */
  approved: boolean
  /** Updated tool input (if the user edited it in the dialog). */
  updatedInput?: Record<string, unknown>
  /** User-provided feedback text (rejection reason or approval note). */
  feedback?: string
}

/**
 * Process a user's response to the frontmost permission request.
 *
 * Returns the updated queue (head removed) and the response metadata
 * needed by the caller to resolve the permission promise.
 *
 * This does NOT call `onAllow` / `onReject` on the ToolUseConfirm — those
 * callbacks contain React/UI side effects that the caller must invoke
 * separately. This function only manages the queue state.
 */
export function processPermissionResponse(
  queue: readonly ToolUseConfirm[],
  _response: PermissionResponse,
): {
  updatedQueue: ToolUseConfirm[]
  processedItem: ToolUseConfirm | undefined
} {
  if (queue.length === 0) {
    return { updatedQueue: [], processedItem: undefined }
  }
  const processedItem = queue[0]!
  const updatedQueue = queue.slice(1)
  return { updatedQueue, processedItem }
}

// ---------------------------------------------------------------------------
// Batch rechecking after permission context changes
// ---------------------------------------------------------------------------

/**
 * When the permission context changes (e.g., a user approves with "don't ask
 * again"), other queued items that now match the updated rules should be
 * rechecked. This function returns the list of items that need rechecking.
 *
 * The actual recheck is async (it calls `recheckPermission()` on each item)
 * and has side effects, so the caller must perform it. This function only
 * identifies which items to recheck.
 *
 * @returns All items in the queue (every item is a recheck candidate after
 *          a permission context change).
 */
export function getItemsToRecheck(
  queue: readonly ToolUseConfirm[],
): readonly ToolUseConfirm[] {
  return queue
}

/**
 * Trigger rechecks on all items in the queue. This is the async side-effect
 * that the caller invokes after a permission context change.
 *
 * This is provided as a convenience — it simply calls `recheckPermission()`
 * on each item. The framework-agnostic part is identifying WHICH items to
 * recheck (all of them); the actual recheck is delegated to each item's
 * callback.
 */
export async function recheckAllItems(
  queue: readonly ToolUseConfirm[],
): Promise<void> {
  // Fire all rechecks concurrently — each item's recheckPermission()
  // independently resolves or stays in queue.
  await Promise.all(
    queue.map(item => item.recheckPermission()),
  )
}

// ---------------------------------------------------------------------------
// Permission context update helpers
// ---------------------------------------------------------------------------

/**
 * Describes a permission context update with optional mode preservation.
 * Extracted from REPL.tsx's `setToolPermissionContext` callback.
 */
export type PermissionContextUpdateOptions = {
  /** When true, keep the existing mode (don't overwrite with the new context's mode). */
  preserveMode?: boolean
}

/**
 * Merge a new permission context with the existing one, optionally
 * preserving the current mode. Pure function — returns the merged context.
 *
 * This mirrors the logic in REPL.tsx's `setToolPermissionContext` callback:
 * ```
 * mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode
 * ```
 */
export function mergePermissionContext(
  current: ToolPermissionContext,
  incoming: ToolPermissionContext,
  options?: PermissionContextUpdateOptions,
): ToolPermissionContext {
  return {
    ...incoming,
    mode: options?.preserveMode ? current.mode : incoming.mode,
  }
}

// ---------------------------------------------------------------------------
// Queue introspection
// ---------------------------------------------------------------------------

/**
 * Check if the queue has any pending items.
 */
export function hasPendingPermissions(
  queue: readonly ToolUseConfirm[],
): boolean {
  return queue.length > 0
}

/**
 * Get the frontmost (currently-displayed) permission request, or undefined.
 */
export function peekFront(
  queue: readonly ToolUseConfirm[],
): ToolUseConfirm | undefined {
  return queue[0]
}

/**
 * Get the number of pending permission requests.
 */
export function pendingCount(queue: readonly ToolUseConfirm[]): number {
  return queue.length
}
