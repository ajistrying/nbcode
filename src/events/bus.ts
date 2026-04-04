/**
 * Typed event bus for decoupling business logic from UI.
 *
 * Design goals:
 *   - Fully standalone: no dependencies on Ink, React, Zustand, or UI code.
 *   - Type-safe: handlers receive the exact event type they subscribed to.
 *   - Safe: handler errors are caught and logged, never propagated to emitters.
 *   - Simple: synchronous emit, unsubscribe via returned function.
 */

import type { AppEvent, AppEventType } from './types.js'
import { logError } from '../utils/log.js'

// ---------------------------------------------------------------------------
// Handler type — extracts the concrete event for a given type string
// ---------------------------------------------------------------------------

export type EventHandler<T extends AppEventType> = (
  event: Extract<AppEvent, { type: T }>,
) => void

// ---------------------------------------------------------------------------
// EventBus implementation
// ---------------------------------------------------------------------------

const ANY_KEY = '*' as const

class EventBus {
  /**
   * Internal subscriber storage.
   *
   * Keyed by event type string (e.g. "tool.started") or "*" for catch-all.
   * Values are Sets for O(1) add/delete and automatic deduplication.
   */
  private handlers = new Map<string, Set<Function>>()

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Subscribe to a specific event type.
   *
   * @returns An unsubscribe function. Call it to remove the handler.
   *
   * @example
   * ```ts
   * const off = eventBus.on('tool.started', (e) => {
   *   console.log(e.toolName) // fully typed
   * })
   * // later
   * off()
   * ```
   */
  on<T extends AppEventType>(type: T, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)

    // Return unsubscribe function
    return () => {
      set!.delete(handler)
      if (set!.size === 0) {
        this.handlers.delete(type)
      }
    }
  }

  /**
   * Subscribe to ALL events regardless of type.
   * Useful for debugging, logging, or telemetry.
   *
   * @returns An unsubscribe function.
   */
  onAny(handler: (event: AppEvent) => void): () => void {
    let set = this.handlers.get(ANY_KEY)
    if (!set) {
      set = new Set()
      this.handlers.set(ANY_KEY, set)
    }
    set.add(handler)

    return () => {
      set!.delete(handler)
      if (set!.size === 0) {
        this.handlers.delete(ANY_KEY)
      }
    }
  }

  /**
   * Emit an event to all matching subscribers.
   *
   * Delivery is synchronous. Handler errors are caught and sent to
   * `logError()` — they never propagate to the caller.
   */
  emit(event: AppEvent): void {
    // Notify type-specific handlers
    const typed = this.handlers.get(event.type)
    if (typed) {
      for (const handler of typed) {
        try {
          handler(event)
        } catch (err) {
          logError(err)
        }
      }
    }

    // Notify catch-all handlers
    const any = this.handlers.get(ANY_KEY)
    if (any) {
      for (const handler of any) {
        try {
          handler(event)
        } catch (err) {
          logError(err)
        }
      }
    }
  }

  /**
   * Remove ALL subscribers (typed and catch-all).
   * Call during teardown / test cleanup.
   */
  clear(): void {
    this.handlers.clear()
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/** Application-wide event bus singleton. */
export const eventBus = new EventBus()
