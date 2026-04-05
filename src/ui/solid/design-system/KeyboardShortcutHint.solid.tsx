/**
 * Renders a keyboard shortcut hint like "ctrl+o to expand" or "(tab to toggle)".
 *
 * SolidJS + OpenTUI port of src/components/design-system/KeyboardShortcutHint.tsx.
 *
 * Wrap in <text dimmed> for the common dim styling.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'

interface KeyboardShortcutHintProps {
  /** The key or chord to display (e.g., "ctrl+o", "Enter", "↑/↓") */
  shortcut: string
  /** The action the key performs (e.g., "expand", "select", "navigate") */
  action: string
  /** Whether to wrap the hint in parentheses. Default: false */
  parens?: boolean
  /** Whether to render the shortcut in bold. Default: false */
  bold?: boolean
}

export function KeyboardShortcutHint(props: KeyboardShortcutHintProps) {
  const parens = () => props.parens ?? false
  const bold = () => props.bold ?? false

  const shortcutText = () =>
    bold() ? <text><b>{props.shortcut}</b></text> : props.shortcut

  return (
    <Show
      when={parens()}
      fallback={<text>{shortcutText()} to {props.action}</text>}
    >
      <text>({shortcutText()} to {props.action})</text>
    </Show>
  )
}
