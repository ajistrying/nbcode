import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import chalk from 'chalk'
import { createContext, useContext } from 'solid-js'
import { getShortcutDisplay } from '../../../keybindings/shortcutFormat.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { InVirtualListContext } from '../../components/messageActions.js'

// Context to track if we're inside a sub agent
const SubAgentContext = createContext(false)

export function SubAgentProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <SubAgentContext.Provider value={true}>
      {props.children}
    </SubAgentContext.Provider>
  )
}

export function CtrlOToExpand(): JSX.Element {
  const isInSubAgent = useContext(SubAgentContext)
  const inVirtualList = useContext(InVirtualListContext)
  const expandShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )

  return (
    <Show when={!isInSubAgent && !inVirtualList}>
      <text dimmed>
        <KeyboardShortcutHint shortcut={expandShortcut} action="expand" parens />
      </text>
    </Show>
  ) as JSX.Element
}

export function ctrlOToExpand(): string {
  const shortcut = getShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )
  return chalk.dim(`(${shortcut} to expand)`)
}
