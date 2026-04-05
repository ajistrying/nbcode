/**
 * A list item component for selection UIs (dropdowns, multi-selects, menus).
 *
 * SolidJS + OpenTUI port of src/components/design-system/ListItem.tsx.
 *
 * Handles the common pattern of:
 * - Pointer indicator (❯) for focused items
 * - Checkmark indicator (✓) for selected items
 * - Scroll indicators (↓↑) for truncated lists
 * - Color states for focus/selection
 */

import figures from 'figures'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'

interface ListItemProps {
  /** Whether this item is currently focused (keyboard selection). */
  isFocused: boolean
  /** Whether this item is selected (chosen/checked). @default false */
  isSelected?: boolean
  /** The content to display for this item. */
  children: JSX.Element
  /** Optional description text displayed below the main content. */
  description?: string
  /** Show a down arrow indicator instead of pointer (for scroll hints). */
  showScrollDown?: boolean
  /** Show an up arrow indicator instead of pointer (for scroll hints). */
  showScrollUp?: boolean
  /**
   * Whether to apply automatic styling to children based on focus/selection state.
   * @default true
   */
  styled?: boolean
  /** Whether this item is disabled. @default false */
  disabled?: boolean
  /**
   * Whether this ListItem should declare the terminal cursor position.
   * @default true
   */
  declareCursor?: boolean
}

export function ListItem(props: ListItemProps) {
  const isSelected = () => props.isSelected ?? false
  const styled = () => props.styled ?? true
  const disabled = () => props.disabled ?? false

  const renderIndicator = (): JSX.Element => {
    if (disabled()) {
      return <text> </text>
    }
    if (props.isFocused) {
      return <text fg="suggestion">{figures.pointer}</text>
    }
    if (props.showScrollDown) {
      return <text dimmed>{figures.arrowDown}</text>
    }
    if (props.showScrollUp) {
      return <text dimmed>{figures.arrowUp}</text>
    }
    return <text> </text>
  }

  const getTextColor = (): string | undefined => {
    if (disabled()) {
      return 'inactive'
    }
    if (!styled()) {
      return undefined
    }
    if (isSelected()) {
      return 'success'
    }
    if (props.isFocused) {
      return 'suggestion'
    }
    return undefined
  }

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        {renderIndicator()}
        <Show
          when={styled()}
          fallback={props.children}
        >
          <text fg={getTextColor()} dimmed={disabled()}>
            {props.children}
          </text>
        </Show>
        <Show when={isSelected() && !disabled()}>
          <text fg="success">{figures.tick}</text>
        </Show>
      </box>
      <Show when={props.description}>
        <box paddingLeft={2}>
          <text fg="inactive">{props.description}</text>
        </box>
      </Show>
    </box>
  )
}
