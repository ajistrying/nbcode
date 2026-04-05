/**
 * Theme-aware Box component for SolidJS + OpenTUI.
 *
 * Equivalent of src/components/design-system/ThemedBox.tsx but using
 * SolidJS reactivity and OpenTUI's <box> element.
 */

import type { JSX } from '@opentui/solid'
import { useThemeColors, resolveColor } from './ThemeProvider.solid.js'

export interface ThemedBoxProps {
  // Layout (pass-through to <box>)
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  flexShrink?: number
  width?: number | string
  height?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  padding?: number
  paddingX?: number
  paddingY?: number
  margin?: number
  marginX?: number
  marginY?: number
  gap?: number
  position?: 'absolute' | 'relative'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch'
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around'
  overflow?: 'visible' | 'hidden'

  // Theme-aware border
  borderStyle?: 'single' | 'double' | 'rounded' | 'heavy'
  borderColor?: string

  // Interaction
  tabIndex?: number
  focused?: boolean
  onClick?: (event: unknown) => void
  onFocus?: () => void
  onBlur?: () => void

  children?: JSX.Element
}

export function ThemedBox(props: ThemedBoxProps) {
  const theme = useThemeColors()

  const borderColor = () => resolveColor(props.borderColor, theme())

  return (
    <box
      flexDirection={props.flexDirection}
      flexGrow={props.flexGrow}
      flexShrink={props.flexShrink}
      width={props.width as number}
      height={props.height as number}
      minWidth={props.minWidth as number}
      maxWidth={props.maxWidth as number}
      padding={props.padding}
      paddingTop={props.paddingY}
      paddingBottom={props.paddingY}
      paddingLeft={props.paddingX}
      paddingRight={props.paddingX}
      marginTop={props.marginY}
      marginBottom={props.marginY}
      marginLeft={props.marginX}
      marginRight={props.marginX}
      gap={props.gap}
      position={props.position}
      borderStyle={props.borderStyle}
      borderColor={borderColor()}
      focused={props.focused}
      tabIndex={props.tabIndex}
      onClick={props.onClick}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    >
      {props.children}
    </box>
  )
}
