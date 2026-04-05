/**
 * Theme-aware Text component for SolidJS + OpenTUI.
 *
 * Equivalent of src/components/design-system/ThemedText.tsx but using
 * SolidJS reactivity and OpenTUI's <text> element.
 */

import type { JSX } from '@opentui/solid'
import { useThemeColors, resolveColor } from './ThemeProvider.solid.js'

export interface ThemedTextProps {
  color?: string
  backgroundColor?: string
  dimColor?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
  wrap?: 'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start'
  children?: JSX.Element
}

export function ThemedText(props: ThemedTextProps) {
  const theme = useThemeColors()

  const fg = () => {
    if (props.dimColor) return theme().inactive
    return resolveColor(props.color, theme())
  }

  const bg = () => resolveColor(props.backgroundColor, theme())

  const inner = () => {
    let node: JSX.Element = props.children
    if (props.bold) node = <b>{node}</b>
    if (props.italic) node = <i>{node}</i>
    if (props.underline) node = <u>{node}</u>
    return node
  }

  return (
    <text
      fg={fg()}
      bg={bg()}
      dimmed={props.dimColor}
      strikethrough={props.strikethrough}
      inverse={props.inverse}
    >
      {inner()}
    </text>
  )
}
