/**
 * Box — layout container, SolidJS + OpenTUI equivalent of Ink's <Box>.
 *
 * Accepts Ink-compatible props and maps them to OpenTUI's <box>.
 * Key differences from Ink:
 *   - `borderStyle` values: 'single' | 'double' | 'rounded' | 'heavy'
 *   - Events use OpenTUI's event shape (not DOM-like)
 *   - No `ref` forwarding needed — use OpenTUI's `ref` prop directly
 */

import type { JSX } from '@opentui/solid'

export interface BoxProps {
  // Layout (Yoga — same model in both)
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  flexShrink?: number
  flexWrap?: boolean
  width?: number | string
  height?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  padding?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  paddingX?: number
  paddingY?: number
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  marginX?: number
  marginY?: number
  gap?: number
  position?: 'absolute' | 'relative'
  top?: number | string
  bottom?: number | string
  left?: number | string
  right?: number | string
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch'
  alignSelf?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'auto'
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around'
  overflow?: 'visible' | 'hidden'

  // Border
  borderStyle?: 'single' | 'double' | 'rounded' | 'heavy'
  borderColor?: string
  borderTop?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
  borderRight?: boolean

  // Interaction
  tabIndex?: number
  focused?: boolean
  onClick?: (event: unknown) => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: unknown) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void

  children?: JSX.Element
}

export function Box(props: BoxProps) {
  return (
    <box
      flexDirection={props.flexDirection}
      flexGrow={props.flexGrow}
      flexShrink={props.flexShrink}
      width={props.width as number}
      height={props.height as number}
      minWidth={props.minWidth as number}
      maxWidth={props.maxWidth as number}
      minHeight={props.minHeight as number}
      maxHeight={props.maxHeight as number}
      padding={props.padding}
      paddingTop={props.paddingTop ?? (props.paddingY !== undefined ? props.paddingY : undefined)}
      paddingBottom={props.paddingBottom ?? (props.paddingY !== undefined ? props.paddingY : undefined)}
      paddingLeft={props.paddingLeft ?? (props.paddingX !== undefined ? props.paddingX : undefined)}
      paddingRight={props.paddingRight ?? (props.paddingX !== undefined ? props.paddingX : undefined)}
      marginTop={props.marginTop ?? (props.marginY !== undefined ? props.marginY : undefined)}
      marginBottom={props.marginBottom ?? (props.marginY !== undefined ? props.marginY : undefined)}
      marginLeft={props.marginLeft ?? (props.marginX !== undefined ? props.marginX : undefined)}
      marginRight={props.marginRight ?? (props.marginX !== undefined ? props.marginX : undefined)}
      gap={props.gap}
      position={props.position}
      borderStyle={props.borderStyle}
      borderColor={props.borderColor}
      focused={props.focused}
      tabIndex={props.tabIndex}
      onClick={props.onClick}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      {props.children}
    </box>
  )
}
