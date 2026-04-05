/**
 * Text — styled text container, SolidJS + OpenTUI equivalent of Ink's <Text>.
 *
 * Key differences from Ink:
 *   - `color` maps to `fg` in OpenTUI
 *   - `backgroundColor` maps to `bg` in OpenTUI
 *   - `bold`, `italic`, `underline` become inline elements (<b>, <i>, <u>)
 *     or style props — OpenTUI supports both
 *   - `dim` maps to `dimmed` style
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'

export interface TextProps {
  color?: string
  backgroundColor?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
  wrap?: 'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start'
  children?: JSX.Element
}

export function Text(props: TextProps) {
  // Build the inner content, wrapping with inline modifiers as needed.
  // OpenTUI supports inline elements: <b>, <i>, <u>, <span> within <text>.
  const inner = () => {
    let node: JSX.Element = props.children

    if (props.bold) node = <b>{node}</b>
    if (props.italic) node = <i>{node}</i>
    if (props.underline) node = <u>{node}</u>

    return node
  }

  return (
    <text
      fg={props.color}
      bg={props.backgroundColor}
      dimmed={props.dim}
      strikethrough={props.strikethrough}
      inverse={props.inverse}
    >
      {inner()}
    </text>
  )
}
