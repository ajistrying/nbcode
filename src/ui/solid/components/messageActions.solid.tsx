/**
 * messageActions — SolidJS port of src/components/messageActions.tsx
 *
 * Provides message navigation, copy, expand/collapse, and edit actions
 * for the message list cursor. Includes MessageActionsBar and
 * MessageActionsKeybindings components.
 */
import figures from 'figures'
import { createSignal, createMemo, Show, For, type JSX, createContext, useContext } from 'solid-js'
import type { NormalizedUserMessage, RenderableMessage } from '../../../types/message.js'

// Re-export types and pure functions from the original module
export {
  isNavigableMessage,
  toolCallOf,
  MESSAGE_ACTIONS,
  stripSystemReminders,
  copyTextOf,
  type NavigableType,
  type NavigableMessage,
  type MessageActionsState,
  type MessageActionsNav,
  type MessageActionCaps,
} from '../../../components/messageActions.js'

import {
  MESSAGE_ACTIONS,
  type MessageActionsState,
  type NavigableMessage,
  type MessageActionCaps,
} from '../../../components/messageActions.js'

// SolidJS context for "am I the selected message?"
export const MessageActionsSelectedContext = createContext(false)
export const InVirtualListContext = createContext(false)

export function useSelectedMessageBg(): string | undefined {
  const isSelected = useContext(MessageActionsSelectedContext)
  return isSelected ? 'messageActionsBackground' : undefined
}

function isApplicable(
  a: (typeof MESSAGE_ACTIONS)[number],
  c: MessageActionsState,
): boolean {
  if (!(a.types as readonly string[]).includes(c.msgType)) return false
  return !a.applies || a.applies(c)
}

/**
 * Returns handlers for message actions keybindings.
 * In SolidJS, we return plain functions instead of using React hooks.
 */
export function createMessageActions(
  getCursor: () => MessageActionsState | null,
  setCursor: (updater: MessageActionsState | null | ((prev: MessageActionsState | null) => MessageActionsState | null)) => void,
  navRef: { current: import('../../../components/messageActions.js').MessageActionsNav | null },
  caps: MessageActionCaps,
) {
  const handlers: Record<string, () => void> = {
    'messageActions:prev': () => navRef.current?.navigatePrev(),
    'messageActions:next': () => navRef.current?.navigateNext(),
    'messageActions:prevUser': () => navRef.current?.navigatePrevUser(),
    'messageActions:nextUser': () => navRef.current?.navigateNextUser(),
    'messageActions:top': () => navRef.current?.navigateTop(),
    'messageActions:bottom': () => navRef.current?.navigateBottom(),
    'messageActions:escape': () =>
      setCursor((c) => (c?.expanded ? { ...c, expanded: false } : null)),
    'messageActions:ctrlc': () => setCursor(null),
  }

  for (const key of new Set(MESSAGE_ACTIONS.map((a) => a.key))) {
    handlers[`messageActions:${key}`] = () => {
      const c = getCursor()
      if (!c) return
      const a = MESSAGE_ACTIONS.find((act) => act.key === key && isApplicable(act, c))
      if (!a) return
      if (a.stays) {
        setCursor((c_1) => (c_1 ? { ...c_1, expanded: !c_1.expanded } : null))
        return
      }
      const m = navRef.current?.getSelected()
      if (!m) return
      ;(a.run as (m: NavigableMessage, c: MessageActionCaps) => void)(m, caps)
      setCursor(null)
    }
  }

  const enter = () => {
    navRef.current?.enterCursor()
  }

  return { enter, handlers }
}

/**
 * MessageActionsKeybindings — mounts inside keybinding context.
 * In SolidJS this is a no-render component that registers keybindings.
 */
export function MessageActionsKeybindings(props: {
  handlers: Record<string, () => void>
  isActive: boolean
}): null {
  // In a real SolidJS app, this would call a keybinding registration primitive.
  // The handlers are passed to a keybinding system externally.
  return null
}

/**
 * MessageActionsBar — bottom bar showing available actions for the selected message.
 */
export function MessageActionsBar(props: { cursor: MessageActionsState }): JSX.Element {
  const applicable = createMemo(() =>
    MESSAGE_ACTIONS.filter((a) => isApplicable(a, props.cursor)),
  )

  return (
    <box flexDirection="column" flexShrink={0} paddingY={1}>
      <box
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      />
      <box paddingX={2} paddingY={1}>
        <For each={applicable()}>
          {(a, i) => {
            const label = () =>
              typeof a.label === 'function' ? a.label(props.cursor) : a.label
            return (
              <>
                <Show when={i() > 0}>
                  <text dimmed> · </text>
                </Show>
                <text>
                  <b>{a.key}</b>
                </text>
                <text dimmed> {label()}</text>
              </>
            )
          }}
        </For>
        <text dimmed> · </text>
        <text>
          <b>
            {figures.arrowUp}
            {figures.arrowDown}
          </b>
        </text>
        <text dimmed> navigate · </text>
        <text>
          <b>esc</b>
        </text>
        <text dimmed> back</text>
      </box>
    </box>
  )
}
