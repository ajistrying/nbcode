import type { JSX } from '@opentui/solid'
import type {
  KeybindingAction,
  KeybindingContextName,
} from '../../../keybindings/types.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'

type Props = {
  /** The keybinding action (e.g., 'app:toggleTranscript') */
  action: KeybindingAction
  /** The keybinding context (e.g., 'Global') */
  context: KeybindingContextName
  /** Default shortcut if keybinding not configured */
  fallback: string
  /** The action description text (e.g., 'expand') */
  description: string
  /** Whether to wrap in parentheses */
  parens?: boolean
  /** Whether to show in bold */
  bold?: boolean
}

export function ConfigurableShortcutHint(props: Props): JSX.Element {
  const shortcut = useShortcutDisplay(props.action, props.context, props.fallback)
  return (
    <KeyboardShortcutHint
      shortcut={shortcut}
      action={props.description}
      parens={props.parens}
      bold={props.bold}
    />
  )
}
