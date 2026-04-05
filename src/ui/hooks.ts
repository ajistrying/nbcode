/**
 * Shared hook type signatures for the React+Ink → OpenTUI+SolidJS migration.
 *
 * Each hook is defined as a TypeScript interface with provider-neutral types.
 * Two concrete implementations exist:
 *
 *   • `src/ui/ink/hooks.ts`   — wraps Ink hooks (current, being phased out)
 *   • `src/ui/solid/hooks.ts` — wraps OpenTUI+Solid hooks (new)
 *
 * Higher-level business logic should depend on these interfaces so it can be
 * tested and run against either backend.
 */

// ---------------------------------------------------------------------------
// Keyboard / Input
// ---------------------------------------------------------------------------

/**
 * Portable key event — subset of properties both Ink and OpenTUI expose.
 */
export interface KeyEvent {
  /** Key name: 'a', 'enter', 'escape', 'tab', 'up', 'down', etc. */
  name: string
  /** Raw character (empty for non-printable keys). */
  char: string
  // Modifiers
  ctrl: boolean
  shift: boolean
  meta: boolean
  alt: boolean
}

export type KeyboardHandler = (event: KeyEvent) => void

/**
 * Subscribe to keyboard events.
 *   Ink:     `useInput(handler)`
 *   OpenTUI: `useKeyboard(handler)`
 */
export type UseKeyboard = (handler: KeyboardHandler) => void

// ---------------------------------------------------------------------------
// Terminal dimensions
// ---------------------------------------------------------------------------

export interface TerminalSize {
  width: number
  height: number
}

/**
 * Reactive terminal dimensions.
 *   Ink:     `useStdout()` → `{ stdout }` → `stdout.columns / stdout.rows`
 *   OpenTUI: `useTerminalDimensions()` → `Accessor<{ width, height }>`
 */
export type UseTerminalDimensions = () => TerminalSize

// ---------------------------------------------------------------------------
// Terminal focus
// ---------------------------------------------------------------------------

/**
 * Whether the terminal window has OS-level focus.
 *   Ink:     `useTerminalFocus()` → `boolean`
 *   OpenTUI: `onFocus()` / `onBlur()` lifecycle hooks
 */
export type UseTerminalFocus = () => boolean

// ---------------------------------------------------------------------------
// Renderer / App
// ---------------------------------------------------------------------------

/**
 * Access the root renderer instance.
 *   Ink:     `useApp()` → Ink instance
 *   OpenTUI: `useRenderer()` → CliRenderer
 */
export interface RendererHandle {
  /** Request the app to exit. */
  exit(code?: number): void
}

export type UseRenderer = () => RendererHandle

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/**
 * Subscribe to paste events (bracketed paste).
 *   Ink:     custom stdin handler
 *   OpenTUI: `usePaste(handler)`
 */
export type UsePaste = (handler: (text: string) => void) => void

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface TextSelection {
  text: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

/**
 * Access current text selection.
 *   Ink:     `useSelection()` → Selection state
 *   OpenTUI: `useSelectionHandler(handler)`
 */
export type UseSelection = (handler: (selection: TextSelection) => void) => void

// ---------------------------------------------------------------------------
// Animation / Timeline
// ---------------------------------------------------------------------------

/**
 * Schedule a callback every frame.
 *   Ink:     `useAnimationFrame(cb)`
 *   OpenTUI: `useTimeline(options)`
 */
export type UseAnimationFrame = (callback: (frame: number) => void) => void

// ---------------------------------------------------------------------------
// Interval
// ---------------------------------------------------------------------------

/**
 * Run a callback on a fixed interval. Cleans up automatically.
 *   Ink:     `useInterval(cb, ms)`
 *   OpenTUI: `setInterval` + `onCleanup` (native Solid pattern)
 */
export type UseInterval = (callback: () => void, ms: number) => void

// ---------------------------------------------------------------------------
// Hook registry — collect all hook signatures into one object so
// implementations can satisfy the whole surface in a single export.
// ---------------------------------------------------------------------------

export interface UIHooks {
  useKeyboard: UseKeyboard
  useTerminalDimensions: UseTerminalDimensions
  useTerminalFocus: UseTerminalFocus
  useRenderer: UseRenderer
  usePaste: UsePaste
  useSelection: UseSelection
  useAnimationFrame: UseAnimationFrame
  useInterval: UseInterval
}
