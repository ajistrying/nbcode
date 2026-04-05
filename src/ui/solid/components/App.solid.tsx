/**
 * App — root application wrapper, SolidJS + OpenTUI equivalent of Ink's <App>.
 *
 * Ink's App component handles:
 *   - Terminal input/output stream management
 *   - Raw mode toggling
 *   - Keyboard and mouse event dispatching
 *   - Ctrl+C exit handling
 *
 * In OpenTUI, most of this is handled by the renderer. This component
 * provides a standard app shell with error boundary and terminal viewport.
 */

import { useTerminalDimensions, useKeyboard, useRenderer } from '@opentui/solid'
import type { JSX } from '@opentui/solid'
import { ErrorOverview } from './simple.solid.js'

export interface AppProps {
  /** Called when the app should exit (Ctrl+C, exit command, etc.) */
  onExit?: (code?: number) => void
  children?: JSX.Element
}

export function App(props: AppProps) {
  const dims = useTerminalDimensions()
  const renderer = useRenderer()

  // Handle Ctrl+C (OpenTUI also supports exitOnCtrlC in render options)
  useKeyboard((event) => {
    if (event.ctrl && event.name === 'c') {
      if (props.onExit) {
        props.onExit(0)
      } else {
        renderer.stop()
        process.exit(0)
      }
    }
  })

  return (
    <ErrorOverview>
      <box
        flexDirection="column"
        width={dims().width}
        height={dims().height}
      >
        {props.children}
      </box>
    </ErrorOverview>
  )
}
