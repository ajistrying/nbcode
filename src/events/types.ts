/**
 * Event type definitions for the application event bus.
 *
 * All events carry only serializable data (no functions, no React elements).
 * This file has no dependencies on Ink, React, Zustand, or any UI code.
 */

// ---------------------------------------------------------------------------
// Lightweight message representation for event payloads.
//
// The canonical Message type lives in src/types/message.ts (when available).
// We define a minimal shape here to keep the event system fully standalone
// and free of heavy UI/framework imports.
// ---------------------------------------------------------------------------

/**
 * Minimal message shape carried in events. Intentionally loose so that any
 * concrete Message type from the rest of the codebase satisfies it.
 */
export interface EventMessage {
  readonly id: string
  readonly role: string
  readonly content: unknown
  readonly type: string
  readonly [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Core message events
// ---------------------------------------------------------------------------

export type MessageCreatedEvent = {
  type: 'message.created'
  message: EventMessage
  sessionId: string
}

export type MessageUpdatedEvent = {
  type: 'message.updated'
  message: EventMessage
  sessionId: string
}

// ---------------------------------------------------------------------------
// Tool events
// ---------------------------------------------------------------------------

export type ToolStartedEvent = {
  type: 'tool.started'
  toolName: string
  toolUseId: string
  input: Record<string, unknown>
}

export type ToolCompletedEvent = {
  type: 'tool.completed'
  toolName: string
  toolUseId: string
  result: string
  durationMs: number
}

export type ToolErrorEvent = {
  type: 'tool.error'
  toolName: string
  toolUseId: string
  error: string
}

export type ToolProgressEvent = {
  type: 'tool.progress'
  toolName: string
  toolUseId: string
  message: string
}

// ---------------------------------------------------------------------------
// Permission events
// ---------------------------------------------------------------------------

export type PermissionRequestedEvent = {
  type: 'permission.requested'
  toolName: string
  toolUseId: string
  description: string
  requestId: string
}

export type PermissionRespondedEvent = {
  type: 'permission.responded'
  requestId: string
  granted: boolean
  remember?: boolean
}

// ---------------------------------------------------------------------------
// Session events
// ---------------------------------------------------------------------------

export type SessionCreatedEvent = {
  type: 'session.created'
  sessionId: string
  projectPath: string
}

export type SessionResumedEvent = {
  type: 'session.resumed'
  sessionId: string
}

export type SessionCompactedEvent = {
  type: 'session.compacted'
  sessionId: string
  tokensSaved: number
}

// ---------------------------------------------------------------------------
// Query / API events
// ---------------------------------------------------------------------------

export type QueryStartedEvent = {
  type: 'query.started'
  model: string
  messageCount: number
}

export type QueryCompletedEvent = {
  type: 'query.completed'
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  costUsd: number
}

export type QueryErrorEvent = {
  type: 'query.error'
  error: string
  isRetryable: boolean
}

// ---------------------------------------------------------------------------
// Agent events
// ---------------------------------------------------------------------------

export type AgentSpawnedEvent = {
  type: 'agent.spawned'
  agentId: string
  agentType: string
  description: string
}

export type AgentCompletedEvent = {
  type: 'agent.completed'
  agentId: string
  result: string
}

// ---------------------------------------------------------------------------
// System events
// ---------------------------------------------------------------------------

export type ShutdownEvent = {
  type: 'system.shutdown'
  reason: string
}

export type ErrorEvent = {
  type: 'system.error'
  error: { message: string; stack?: string; name: string }
  context: string
}

// ---------------------------------------------------------------------------
// Discriminated union of all application events
// ---------------------------------------------------------------------------

export type AppEvent =
  // Messages
  | MessageCreatedEvent
  | MessageUpdatedEvent
  // Tools
  | ToolStartedEvent
  | ToolCompletedEvent
  | ToolErrorEvent
  | ToolProgressEvent
  // Permissions
  | PermissionRequestedEvent
  | PermissionRespondedEvent
  // Sessions
  | SessionCreatedEvent
  | SessionResumedEvent
  | SessionCompactedEvent
  // Queries
  | QueryStartedEvent
  | QueryCompletedEvent
  | QueryErrorEvent
  // Agents
  | AgentSpawnedEvent
  | AgentCompletedEvent
  // System
  | ShutdownEvent
  | ErrorEvent

/**
 * Union of all event type string literals.
 * Useful for constraining handler registrations.
 */
export type AppEventType = AppEvent['type']
