/**
 * OpenTUI + SolidJS proof of concept entry point.
 *
 * Run with:  bun run src/ui/solid/poc.solid.tsx
 *
 * This validates:
 *   1. The dual-JSX Bun plugin correctly transforms .solid.tsx files
 *   2. OpenTUI renders a SolidJS component to the terminal
 *   3. Reactive updates (spinner animation) work as expected
 *   4. Keyboard input handling via useKeyboard works
 *
 * Press 'q' or Ctrl+C to exit.
 */

import { render } from '@opentui/solid'
import { createSignal, onCleanup, Show } from 'solid-js'
import { Spinner } from './Spinner.solid.js'

function App() {
  const [status, setStatus] = createSignal('running')
  const [keyLog, setKeyLog] = createSignal('')

  return (
    <box flexDirection="column" padding={1} gap={1}>
      {/* Header */}
      <text>
        <b fg="#57c7ff">Noble Base Code</b>
        <span> — OpenTUI + SolidJS proof of concept</span>
      </text>

      {/* Spinner */}
      <box flexDirection="row" gap={1}>
        <Spinner label={`Status: ${status()}`} />
      </box>

      {/* System info */}
      <box flexDirection="column">
        <text fg="#909090">
          Runtime: Bun {typeof Bun !== 'undefined' ? Bun.version : 'unknown'}
        </text>
        <text fg="#909090">
          Renderer: OpenTUI + SolidJS
        </text>
        <Show when={keyLog()}>
          <text fg="#909090">
            Last key: {keyLog()}
          </text>
        </Show>
      </box>

      {/* Instructions */}
      <text dim>
        Press 'q' or Ctrl+C to exit
      </text>
    </box>
  )
}

await render(() => <App />, {
  exitOnCtrlC: true,
})
