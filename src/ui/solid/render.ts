/**
 * OpenTUI render adapter — provides a Root-like interface compatible with
 * the existing main.tsx wiring.
 *
 * The Ink rendering system uses a `Root` object with methods:
 *   - root.render(element) — mount/update the React tree
 *   - root.unmount() — tear down
 *   - root.waitUntilExit() — promise that resolves on exit
 *
 * This adapter wraps OpenTUI's `render()` to provide the same interface,
 * enabling a gradual switchover from Ink to OpenTUI in main.tsx.
 */

import { render as otuiRender } from '@opentui/solid'
import type { JSX } from '@opentui/solid'

export interface SolidRoot {
  /** Render a SolidJS component tree. */
  render(element: () => JSX.Element): Promise<void>
  /** Unmount and clean up. */
  unmount(): void
  /** Promise that resolves when the app exits. */
  waitUntilExit(): Promise<void>
}

/**
 * Create an OpenTUI+SolidJS root, analogous to Ink's `createRoot()`.
 */
export async function createSolidRoot(options?: {
  exitOnCtrlC?: boolean
}): Promise<SolidRoot> {
  let exitResolve: (() => void) | null = null
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = resolve
  })

  let mounted = false

  return {
    async render(element: () => JSX.Element) {
      if (mounted) {
        // OpenTUI doesn't support re-render with a new root element.
        // For dialog-style re-renders, use signals to swap content.
        return
      }
      mounted = true
      await otuiRender(element, {
        exitOnCtrlC: options?.exitOnCtrlC ?? true,
      })
      // render() resolves when the app exits
      exitResolve?.()
    },

    unmount() {
      // OpenTUI handles cleanup when render() resolves
      exitResolve?.()
    },

    waitUntilExit() {
      return exitPromise
    },
  }
}
