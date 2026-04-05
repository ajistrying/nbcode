/**
 * Button — interactive button, SolidJS + OpenTUI equivalent of Ink's <Button>.
 *
 * Ink's Button renders as a focusable <Box> with keyboard (Enter/Space) and
 * click activation. OpenTUI has no built-in button, so we compose one from
 * <box> + useKeyboard.
 */

import { createSignal } from 'solid-js'
import { useKeyboard } from '@opentui/solid'
import type { JSX } from '@opentui/solid'

export interface ButtonState {
  focused: boolean
  hovered: boolean
  active: boolean
}

export interface ButtonProps {
  onAction: () => void
  tabIndex?: number
  focused?: boolean
  disabled?: boolean

  // Layout pass-through
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  padding?: number
  width?: number | string

  children: ((state: ButtonState) => JSX.Element) | JSX.Element
}

export function Button(props: ButtonProps) {
  const [hovered, setHovered] = createSignal(false)
  const [active, setActive] = createSignal(false)

  useKeyboard((event) => {
    if (props.disabled) return
    if (!props.focused) return

    if (event.name === 'return' || event.name === 'space') {
      setActive(true)
      props.onAction()
      // Reset active state after a brief flash
      setTimeout(() => setActive(false), 100)
    }
  })

  const state = (): ButtonState => ({
    focused: props.focused ?? false,
    hovered: hovered(),
    active: active(),
  })

  const content = () => {
    const c = props.children
    return typeof c === 'function' ? c(state()) : c
  }

  return (
    <box
      flexDirection={props.flexDirection}
      flexGrow={props.flexGrow}
      padding={props.padding}
      width={props.width as number}
      tabIndex={props.tabIndex ?? 0}
      focused={props.focused}
      onClick={() => {
        if (!props.disabled) props.onAction()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {content()}
    </box>
  )
}
