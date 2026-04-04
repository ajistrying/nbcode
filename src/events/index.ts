/**
 * Event bus system for decoupling business logic from UI.
 *
 * @example
 * ```ts
 * import { eventBus } from './events/index.js'
 * import type { AppEvent, ToolStartedEvent } from './events/index.js'
 *
 * // Subscribe to a specific event type
 * const off = eventBus.on('tool.started', (event) => {
 *   console.log(event.toolName)
 * })
 *
 * // Emit an event
 * eventBus.emit({ type: 'tool.started', toolName: 'Read', toolUseId: '123', input: {} })
 *
 * // Unsubscribe
 * off()
 * ```
 */

export type {
  // Individual event types
  MessageCreatedEvent,
  MessageUpdatedEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
  ToolErrorEvent,
  ToolProgressEvent,
  PermissionRequestedEvent,
  PermissionRespondedEvent,
  SessionCreatedEvent,
  SessionResumedEvent,
  SessionCompactedEvent,
  QueryStartedEvent,
  QueryCompletedEvent,
  QueryErrorEvent,
  AgentSpawnedEvent,
  AgentCompletedEvent,
  ShutdownEvent,
  ErrorEvent,
  // Union and utility types
  AppEvent,
  AppEventType,
  EventMessage,
} from './types.js'

export { eventBus, type EventHandler } from './bus.js'
