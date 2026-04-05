/**
 * Session management logic extracted from REPL.tsx.
 *
 * Pure functions — no React imports. These capture the business rules for:
 * - Merging on-disk agent transcripts with live messages (UUID dedup)
 * - Tracking the user-input baseline for placeholder visibility
 * - Computing pending (new-since-last-user-input) messages for attribution
 *
 * The REPL component remains the owner of React state (useState, useRef).
 * It calls these functions to compute the next state value, then applies
 * it through its own setState / ref-update wrappers.
 */

import type { Message } from '../../types/message.js'

// ═══════════════════════════════════════════════════════════════════
// Agent transcript bootstrap
// ═══════════════════════════════════════════════════════════════════

/**
 * Merge on-disk agent transcript with live (in-memory) messages.
 *
 * The disk transcript is the authoritative prefix — it was written before
 * the task yielded, so `liveMessages` is always a suffix of
 * `diskMessages`. We UUID-dedup to avoid duplicating messages that
 * exist in both.
 *
 * Mirrors the bootstrap logic at REPL.tsx ~L654-L667.
 */
export function mergeAgentTranscript(
  diskMessages: Message[],
  liveMessages: Message[],
): Message[] {
  const liveUuids = new Set(liveMessages.map(m => m.uuid))
  const diskOnly = diskMessages.filter(m => !liveUuids.has(m.uuid))
  return [...diskOnly, ...liveMessages]
}

// ═══════════════════════════════════════════════════════════════════
// User-input baseline tracking
// ═══════════════════════════════════════════════════════════════════

/**
 * Mutable state that tracks the baseline message count and whether a
 * user message is still pending. REPL.tsx keeps this in refs
 * (userInputBaselineRef, userMessagePendingRef). The handler operates
 * on a plain object so it can be tested without React.
 */
export type BaselineState = {
  /** Message count at the moment the user submitted input. */
  baseline: number
  /** True while the submitted user message hasn't landed in the transcript. */
  userMessagePending: boolean
}

/**
 * Determine whether a message is a human turn (user prompt, not a tool
 * result or meta message). Accepts a predicate so callers can inject
 * the existing `isHumanTurn` from `utils/messagePredicates` without
 * coupling this module to that import.
 */
type IsHumanTurnFn = (m: Message) => boolean

/**
 * Compute the next baseline state after the message array changes.
 *
 * Called inside the setMessages wrapper (REPL.tsx ~L1201-L1225) to keep
 * the placeholder text visible until the real user message arrives.
 *
 * Rules:
 * 1. If the array shrank (compact / rewind / clear), clamp baseline to 0.
 * 2. If it grew while the user message is still pending:
 *    a. If any added messages are human turns, mark pending = false.
 *    b. Otherwise bump baseline to the new length (keep placeholder visible).
 * 3. Otherwise leave state unchanged.
 */
export function updateBaseline(
  prev: Message[],
  next: Message[],
  state: BaselineState,
  isHumanTurn: IsHumanTurnFn,
): BaselineState {
  if (next.length < state.baseline) {
    // Shrank (compact/rewind/clear) — clamp so placeholder length check
    // can't go stale.
    return { baseline: 0, userMessagePending: state.userMessagePending }
  }

  if (next.length > prev.length && state.userMessagePending) {
    // Grew while the submitted user message hasn't landed yet.
    const delta = next.length - prev.length
    const added =
      prev.length === 0 || next[0] === prev[0]
        ? next.slice(-delta)
        : next.slice(0, delta)

    if (added.some(isHumanTurn)) {
      return { baseline: state.baseline, userMessagePending: false }
    }
    return { baseline: next.length, userMessagePending: true }
  }

  return state
}

/**
 * Reset baseline state when the user submits new input.
 *
 * Called from setUserInputOnProcessing (REPL.tsx ~L1228-L1236).
 */
export function resetBaselineForSubmit(
  currentMessageCount: number,
): BaselineState {
  return { baseline: currentMessageCount, userMessagePending: true }
}

/**
 * Clear the pending flag (e.g. when placeholder text is cleared).
 */
export function clearBaselinePending(state: BaselineState): BaselineState {
  return { ...state, userMessagePending: false }
}

// ═══════════════════════════════════════════════════════════════════
// Pending / attribution message tracking
// ═══════════════════════════════════════════════════════════════════

/**
 * Find the baseline index — the position of the last human turn in the
 * message array. Messages after this index are "pending" (generated
 * since the user's last input) and eligible for commit attribution.
 *
 * Returns 0 if no human turn is found (all messages are pending).
 */
export function findUserInputBaseline(
  messages: Message[],
  isHumanTurn: IsHumanTurnFn,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanTurn(messages[i]!)) {
      return i
    }
  }
  return 0
}

/**
 * Track which messages are new since the user's last input.
 *
 * Used for commit attribution: only messages after the baseline index
 * are attributed to the current prompt. The baseline index is typically
 * the position of the last user message.
 */
export function computePendingMessages(
  allMessages: Message[],
  baselineIndex: number,
): Message[] {
  if (baselineIndex < 0 || baselineIndex >= allMessages.length) {
    return []
  }
  return allMessages.slice(baselineIndex + 1)
}

/**
 * Determine whether the placeholder text should still be visible.
 *
 * The placeholder shows the user's submitted text while we wait for
 * processUserInput to create the real user message. It hides once the
 * displayed message count exceeds the baseline.
 *
 * Mirrors the check at REPL.tsx ~L4521.
 */
export function shouldShowPlaceholder(
  displayedMessageCount: number,
  baseline: number,
  hasUserInputOnProcessing: boolean,
  isViewingAgentTask: boolean,
): boolean {
  return (
    hasUserInputOnProcessing &&
    !isViewingAgentTask &&
    displayedMessageCount <= baseline
  )
}
