/**
 * OpenTUI+SolidJS implementation of the shared UI hook interfaces.
 *
 * Each function wraps the corresponding OpenTUI/Solid hook and normalises
 * its output to the provider-neutral types defined in `../hooks.ts`.
 */

import {
  useKeyboard as otuiUseKeyboard,
  useTerminalDimensions as otuiUseTerminalDimensions,
  useRenderer as otuiUseRenderer,
  usePaste as otuiUsePaste,
  useSelectionHandler as otuiUseSelectionHandler,
  useTimeline,
  onFocus,
  onBlur,
} from '@opentui/solid'
import { createSignal, onCleanup } from 'solid-js'
import type {
  KeyEvent,
  KeyboardHandler,
  TerminalSize,
  RendererHandle,
  TextSelection,
  UIHooks,
} from '../hooks.js'

// ---------------------------------------------------------------------------
// useKeyboard
// ---------------------------------------------------------------------------

function useKeyboard(handler: KeyboardHandler): void {
  otuiUseKeyboard((raw) => {
    const event: KeyEvent = {
      name: raw.name ?? '',
      char: raw.char ?? '',
      ctrl: raw.ctrl ?? false,
      shift: raw.shift ?? false,
      meta: raw.meta ?? false,
      alt: raw.alt ?? false,
    }
    handler(event)
  })
}

// ---------------------------------------------------------------------------
// useTerminalDimensions
// ---------------------------------------------------------------------------

function useTerminalDimensions(): TerminalSize {
  const dims = otuiUseTerminalDimensions()
  // dims is an Accessor — call it to get current value.
  // In Solid, the caller will read this reactively.
  return dims()
}

// ---------------------------------------------------------------------------
// useTerminalFocus
// ---------------------------------------------------------------------------

function useTerminalFocus(): boolean {
  const [focused, setFocused] = createSignal(true)
  onFocus(() => setFocused(true))
  onBlur(() => setFocused(false))
  return focused()
}

// ---------------------------------------------------------------------------
// useRenderer
// ---------------------------------------------------------------------------

function useRenderer(): RendererHandle {
  const renderer = otuiUseRenderer()
  return {
    exit(code?: number) {
      renderer.stop()
      process.exit(code ?? 0)
    },
  }
}

// ---------------------------------------------------------------------------
// usePaste
// ---------------------------------------------------------------------------

function usePaste(handler: (text: string) => void): void {
  otuiUsePaste((event) => {
    handler(event.text)
  })
}

// ---------------------------------------------------------------------------
// useSelection
// ---------------------------------------------------------------------------

function useSelection(handler: (selection: TextSelection) => void): void {
  otuiUseSelectionHandler((raw) => {
    handler({
      text: raw.text ?? '',
      startLine: raw.startRow ?? 0,
      startCol: raw.startCol ?? 0,
      endLine: raw.endRow ?? 0,
      endCol: raw.endCol ?? 0,
    })
  })
}

// ---------------------------------------------------------------------------
// useAnimationFrame
// ---------------------------------------------------------------------------

function useAnimationFrame(callback: (frame: number) => void): void {
  const timeline = useTimeline({ loop: true })
  let frame = 0
  // useTimeline runs per-frame; we adapt via a tick callback
  const id = setInterval(() => {
    callback(frame++)
  }, 1000 / 60)
  onCleanup(() => clearInterval(id))
}

// ---------------------------------------------------------------------------
// useInterval
// ---------------------------------------------------------------------------

function useInterval(callback: () => void, ms: number): void {
  const id = setInterval(callback, ms)
  onCleanup(() => clearInterval(id))
}

// ---------------------------------------------------------------------------
// useTerminalTitle — set the terminal window/tab title
// ---------------------------------------------------------------------------

function useTerminalTitle(title: () => string): void {
  const renderer = otuiUseRenderer()
  // In Solid, createEffect auto-tracks reactive dependencies.
  // When title() changes, this writes the new title via OSC 0.
  import('solid-js').then(({ createEffect }) => {
    createEffect(() => {
      const t = title()
      if (t) {
        // OSC 0 — set window title
        process.stdout.write(`\x1b]0;${t}\x07`)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// useTabStatus — set iTerm2/xterm tab title and progress
// ---------------------------------------------------------------------------

function useTabStatus(title: () => string): void {
  import('solid-js').then(({ createEffect }) => {
    createEffect(() => {
      const t = title()
      if (t) {
        // OSC 1 — set tab title (iTerm2, some xterm)
        process.stdout.write(`\x1b]1;${t}\x07`)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// useTerminalViewport — detect if component is within visible viewport
// ---------------------------------------------------------------------------

function useTerminalViewport(): { isVisible: boolean } {
  // OpenTUI handles viewport culling natively in its renderer.
  // Components outside the viewport are simply not rendered.
  // This stub always returns visible; the renderer handles the rest.
  return { isVisible: true }
}

// ---------------------------------------------------------------------------
// useSearchHighlight — reactive search query state for highlighting
// ---------------------------------------------------------------------------

function useSearchHighlight(): {
  query: () => string
  setQuery: (q: string) => void
  isActive: () => boolean
} {
  const [query, setQuery] = createSignal('')
  const isActive = () => query().length > 0
  return { query, setQuery, isActive }
}

// ---------------------------------------------------------------------------
// useDeclaredCursor — declare cursor position to the renderer
// ---------------------------------------------------------------------------

function useDeclaredCursor(): {
  setCursorPosition: (col: number, row: number) => void
  clearCursor: () => void
} {
  const renderer = otuiUseRenderer()
  return {
    setCursorPosition(col: number, row: number) {
      // OpenTUI's renderer manages cursor position natively.
      // Write CSI sequence directly for cursor placement.
      process.stdout.write(`\x1b[${row + 1};${col + 1}H`)
    },
    clearCursor() {
      // Hide cursor
      process.stdout.write('\x1b[?25l')
    },
  }
}

// ---------------------------------------------------------------------------
// Collected export
// ---------------------------------------------------------------------------

export const solidHooks: UIHooks = {
  useKeyboard,
  useTerminalDimensions,
  useTerminalFocus,
  useRenderer,
  usePaste,
  useSelection,
  useAnimationFrame,
  useInterval,
}

export {
  useKeyboard,
  useTerminalDimensions,
  useTerminalFocus,
  useRenderer,
  usePaste,
  useSelection,
  useAnimationFrame,
  useInterval,
  useTerminalTitle,
  useTabStatus,
  useTerminalViewport,
  useSearchHighlight,
  useDeclaredCursor,
}
