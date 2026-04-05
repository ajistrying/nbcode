/**
 * Simple/trivial primitive components — SolidJS + OpenTUI equivalents.
 *
 * These are thin enough to live in a single file:
 *   - Spacer       → <box flexGrow={1} />
 *   - Newline      → <br /> (repeated N times)
 *   - Link         → <a href={...}>
 *   - RawAnsi      → direct text injection via <text>
 *   - NoSelect     → wrapper that marks content non-selectable
 *   - ErrorBoundary → SolidJS error boundary
 */

import { createSignal, ErrorBoundary as SolidErrorBoundary, For } from 'solid-js'
import type { JSX } from '@opentui/solid'

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

export function Spacer() {
  return <box flexGrow={1} />
}

// ---------------------------------------------------------------------------
// Newline
// ---------------------------------------------------------------------------

export interface NewlineProps {
  count?: number
}

export function Newline(props: NewlineProps) {
  const lines = () => Array.from({ length: props.count ?? 1 })
  return (
    <text>
      <For each={lines()}>{() => <br />}</For>
    </text>
  )
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export interface LinkProps {
  url: string
  children?: JSX.Element
}

export function Link(props: LinkProps) {
  return <a href={props.url}>{props.children ?? props.url}</a>
}

// ---------------------------------------------------------------------------
// RawAnsi
// ---------------------------------------------------------------------------

export interface RawAnsiProps {
  /** Raw ANSI escape sequence string to render verbatim. */
  content: string
}

export function RawAnsi(props: RawAnsiProps) {
  // OpenTUI renders text content directly; ANSI sequences pass through.
  return <text>{props.content}</text>
}

// ---------------------------------------------------------------------------
// NoSelect
// ---------------------------------------------------------------------------

export interface NoSelectProps {
  children?: JSX.Element
}

export function NoSelect(props: NoSelectProps) {
  // OpenTUI elements have a `selectable` prop. Wrap in a non-selectable box.
  return <box selectable={false}>{props.children}</box>
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children?: JSX.Element
  fallback?: (error: Error, reset: () => void) => JSX.Element
}

export function ErrorOverview(props: ErrorBoundaryProps) {
  const defaultFallback = (error: Error, reset: () => void) => (
    <box flexDirection="column" padding={1} borderStyle="rounded" borderColor="#ff5555">
      <text fg="#ff5555">
        <b>Error:</b> {error.message}
      </text>
      {error.stack ? (
        <text fg="#909090" dimmed>{error.stack}</text>
      ) : null}
    </box>
  )

  return (
    <SolidErrorBoundary fallback={props.fallback ?? defaultFallback}>
      {props.children}
    </SolidErrorBoundary>
  )
}
