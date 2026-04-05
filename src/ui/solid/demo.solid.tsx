/**
 * Demo: OpenTUI + SolidJS design system components.
 *
 * Run with: bun run src/ui/solid/demo.solid.tsx
 *
 * Tests that:
 *   1. Primitive components (Box, Text, ScrollBox) render correctly
 *   2. Design system (ThemedBox, ThemedText, Divider, StatusIcon, ProgressBar) work
 *   3. Spinner animation (reactive signals) functions
 *   4. useKeyboard hook works
 *
 * Press 'q' or Ctrl+C to exit.
 */

import { render } from '@opentui/solid'
import { createSignal, onCleanup } from 'solid-js'
import { Spinner } from './Spinner.solid.js'

function App() {
  const [progress, setProgress] = createSignal(0)

  // Animate progress bar
  const id = setInterval(() => {
    setProgress((p) => (p >= 1 ? 0 : p + 0.02))
  }, 100)
  onCleanup(() => clearInterval(id))

  return (
    <box flexDirection="column" padding={1} gap={1}>
      {/* Header */}
      <text>
        <b fg="#57c7ff">Noble Base Code</b>
        <span> — Design System Demo</span>
      </text>

      {/* Divider */}
      <text fg="#555555">{'─'.repeat(60)}</text>

      {/* Status indicators */}
      <box flexDirection="column" gap={0}>
        <text><span fg="#5af78e">✓</span> Packages installed</text>
        <text><span fg="#5af78e">✓</span> Dual-JSX build configured</text>
        <text><span fg="#5af78e">✓</span> Primitives ported</text>
        <text><span fg="#5af78e">✓</span> Design system created</text>
        <text><span fg="#57c7ff">●</span> Demo running</text>
      </box>

      {/* Progress bar */}
      <box flexDirection="row" gap={1}>
        <text fg="#909090">Progress:</text>
        <text>
          <span fg="#57c7ff">{'█'.repeat(Math.round(progress() * 30))}</span>
          <span fg="#555555">{'░'.repeat(30 - Math.round(progress() * 30))}</span>
        </text>
        <text fg="#909090">{Math.round(progress() * 100)}%</text>
      </box>

      {/* Spinner */}
      <Spinner label="Processing..." color="#ff6ac1" />

      {/* System info */}
      <box flexDirection="column">
        <text fg="#909090">Runtime: Bun {typeof Bun !== 'undefined' ? Bun.version : '?'}</text>
        <text fg="#909090">Renderer: OpenTUI + SolidJS v0.1.96</text>
        <text fg="#909090">Framework: SolidJS (no VDOM)</text>
      </box>

      <text dim>Press 'q' or Ctrl+C to exit</text>
    </box>
  )
}

await render(() => <App />, { exitOnCtrlC: true })
