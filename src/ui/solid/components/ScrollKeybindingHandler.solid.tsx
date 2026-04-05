import { createEffect, onCleanup, type JSXElement } from 'solid-js'
import { useNotifications } from '../../../context/notifications.js'
import { useCopyOnSelect, useSelectionBgColor } from '../../../hooks/useCopyOnSelect.js'
import type { ScrollBoxHandle } from '../../../ink/components/ScrollBox.js'
import { useSelection } from '../../../ink/hooks/use-selection.js'
import type { FocusMove, SelectionState } from '../../../ink/selection.js'
import { isXtermJs } from '../../../ink/terminal.js'
import { getClipboardPath } from '../../../ink/termio/osc.js'
import type { Key } from '../../../ink.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import { logForDebugging } from '../../../utils/debug.js'

type Props = {
  scrollRef: { current: ScrollBoxHandle | null }
  isActive: boolean
  onScroll?: (sticky: boolean, handle: ScrollBoxHandle) => void
  isModal?: boolean
}

// --- Wheel acceleration constants (native) ---
const WHEEL_ACCEL_WINDOW_MS = 40
const WHEEL_ACCEL_STEP = 0.3
const WHEEL_ACCEL_MAX = 6

// --- Encoder bounce / wheel-mode ---
const WHEEL_BOUNCE_GAP_MAX_MS = 200
const WHEEL_MODE_STEP = 15
const WHEEL_MODE_CAP = 15
const WHEEL_MODE_RAMP = 3
const WHEEL_MODE_IDLE_DISENGAGE_MS = 1500

// --- xterm.js decay curve ---
const WHEEL_DECAY_HALFLIFE_MS = 150
const WHEEL_DECAY_STEP = 5
const WHEEL_BURST_MS = 5
const WHEEL_DECAY_GAP_MS = 80
const WHEEL_DECAY_CAP_SLOW = 3
const WHEEL_DECAY_CAP_FAST = 6
const WHEEL_DECAY_IDLE_MS = 500

export type WheelAccelState = {
  time: number
  mult: number
  dir: 0 | 1 | -1
  xtermJs: boolean
  frac: number
  base: number
  pendingFlip: boolean
  wheelMode: boolean
  burstCount: number
}

/**
 * Whether a keypress should clear virtual text selection.
 */
export function shouldClearSelectionOnKey(key: Key): boolean {
  if (key.wheelUp || key.wheelDown) return false
  const isNav =
    key.leftArrow ||
    key.rightArrow ||
    key.upArrow ||
    key.downArrow ||
    key.home ||
    key.end ||
    key.pageUp ||
    key.pageDown
  if (isNav && (key.shift || key.meta || key.super)) return false
  return true
}

/**
 * Map a keypress to a selection focus move.
 */
export function selectionFocusMoveForKey(key: Key): FocusMove | null {
  if (!key.shift || key.meta) return null
  if (key.leftArrow) return 'left'
  if (key.rightArrow) return 'right'
  if (key.upArrow) return 'up'
  if (key.downArrow) return 'down'
  if (key.home) return 'lineStart'
  if (key.end) return 'lineEnd'
  return null
}

/** Compute rows for one wheel event, mutating accel state. */
export function computeWheelStep(state: WheelAccelState, dir: 1 | -1, now: number): number {
  if (!state.xtermJs) {
    // Device-switch guard: idle disengage
    if (state.wheelMode && now - state.time > WHEEL_MODE_IDLE_DISENGAGE_MS) {
      state.wheelMode = false
      state.burstCount = 0
      state.mult = state.base
    }

    // Resolve deferred flip
    if (state.pendingFlip) {
      state.pendingFlip = false
      if (dir !== state.dir || now - state.time > WHEEL_BOUNCE_GAP_MAX_MS) {
        state.dir = dir
        state.time = now
        state.mult = state.base
        return Math.floor(state.mult)
      }
      // Bounce confirmed
      state.wheelMode = true
      state.burstCount = 0
      state.dir = dir
      state.time = now
      return Math.floor(state.mult)
    }

    // Burst count for device-switch detection
    const gap = now - state.time
    if (gap < WHEEL_BURST_MS) {
      state.burstCount++
      if (state.burstCount >= 5 && state.wheelMode) {
        state.wheelMode = false
        state.mult = state.base
      }
    } else {
      state.burstCount = 0
    }

    // Direction change — defer for bounce detection
    if (state.dir !== 0 && dir !== state.dir) {
      state.pendingFlip = true
      state.time = now
      return 0
    }

    // Wheel mode: exponential-decay curve
    if (state.wheelMode) {
      const m = Math.pow(0.5, gap / WHEEL_DECAY_HALFLIFE_MS)
      const target = Math.min(1 + WHEEL_MODE_STEP * m, WHEEL_MODE_CAP)
      state.mult = Math.min(state.mult + WHEEL_MODE_RAMP, target)
      state.dir = dir
      state.time = now
      const raw = state.mult + state.frac
      const step = Math.floor(raw)
      state.frac = raw - step
      return step
    }

    // Normal accel: linear ramp
    if (gap < WHEEL_ACCEL_WINDOW_MS) {
      state.mult = Math.min(state.mult + WHEEL_ACCEL_STEP, WHEEL_ACCEL_MAX)
    } else {
      state.mult = state.base
    }
    state.dir = dir
    state.time = now
    return Math.floor(state.mult)
  }

  // xterm.js path: exponential decay curve
  const gap = now - state.time
  if (gap > WHEEL_DECAY_IDLE_MS) {
    state.mult = 2
    state.frac = 0
    state.dir = dir
    state.time = now
    return 2
  }

  if (dir !== state.dir) {
    state.mult = state.base
    state.frac = 0
    state.dir = dir
    state.time = now
    return Math.floor(state.mult)
  }

  const isBurst = gap < WHEEL_BURST_MS
  if (isBurst) {
    state.time = now
    return 1
  }

  const m = Math.pow(0.5, gap / WHEEL_DECAY_HALFLIFE_MS)
  const cap = gap >= WHEEL_DECAY_GAP_MS ? WHEEL_DECAY_CAP_SLOW : WHEEL_DECAY_CAP_FAST
  state.mult = Math.min(1 + WHEEL_DECAY_STEP * m, cap)
  state.dir = dir
  state.time = now
  const raw = state.mult + state.frac
  const step = Math.floor(raw)
  state.frac = raw - step
  return step
}

function createWheelAccelState(): WheelAccelState {
  const envSpeed = parseInt(process.env.CLAUDE_CODE_SCROLL_SPEED || '', 10)
  const base = Number.isFinite(envSpeed) && envSpeed > 0 ? envSpeed : 1
  return {
    time: 0,
    mult: base,
    dir: 0,
    xtermJs: isXtermJs(),
    frac: 0,
    base,
    pendingFlip: false,
    wheelMode: false,
    burstCount: 0,
  }
}

/**
 * Keyboard/mouse-wheel scroll handler for fullscreen mode.
 * In SolidJS, we register keybindings reactively and manage
 * wheel accel state via a plain let variable (replaces useRef).
 */
export function ScrollKeybindingHandler(props: Props): JSXElement {
  let accel = createWheelAccelState()
  const selection = useSelection()
  const selectionBgColor = useSelectionBgColor()
  const { addNotification } = useNotifications()

  function scrollBy(delta: number) {
    const handle = props.scrollRef.current
    if (!handle) return
    handle.scrollBy(delta)
    const sticky = handle.isAtBottom()
    props.onScroll?.(sticky, handle)
  }

  function scrollToBottom() {
    const handle = props.scrollRef.current
    if (!handle) return
    handle.scrollToBottom()
    props.onScroll?.(true, handle)
  }

  function scrollToTop() {
    const handle = props.scrollRef.current
    if (!handle) return
    handle.scrollTo(0)
    props.onScroll?.(false, handle)
  }

  // Register keybindings
  useKeybindings(
    {
      'scroll:lineUp': () => scrollBy(-1),
      'scroll:lineDown': () => scrollBy(1),
      'scroll:halfPageUp': () => {
        const handle = props.scrollRef.current
        if (handle) scrollBy(-Math.floor(handle.viewportHeight / 2))
      },
      'scroll:halfPageDown': () => {
        const handle = props.scrollRef.current
        if (handle) scrollBy(Math.floor(handle.viewportHeight / 2))
      },
      'scroll:pageUp': () => {
        const handle = props.scrollRef.current
        if (handle) scrollBy(-handle.viewportHeight)
      },
      'scroll:pageDown': () => {
        const handle = props.scrollRef.current
        if (handle) scrollBy(handle.viewportHeight)
      },
      'scroll:top': () => scrollToTop(),
      'scroll:bottom': () => scrollToBottom(),
      'scroll:copy': () => {
        if (selection) {
          const text = selection.getText?.()
          if (text) {
            // Copy to clipboard
            const clipPath = getClipboardPath()
            if (clipPath) {
              addNotification({
                key: 'copy-selection',
                text: 'Copied to clipboard',
                priority: 'immediate',
                timeoutMs: 1500,
              })
            }
          }
        }
      },
    },
    { context: 'Scroll', isActive: props.isActive },
  )

  // Wheel event handling would be done through the terminal's input
  // system — in OpenTUI, scrollbox handles wheel natively

  return null // This is a behavior-only component (no visual output)
}
