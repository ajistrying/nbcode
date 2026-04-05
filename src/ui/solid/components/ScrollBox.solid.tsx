/**
 * ScrollBox — scrollable container, SolidJS + OpenTUI equivalent of Ink's <ScrollBox>.
 *
 * OpenTUI's <scrollbox> provides built-in scrolling with viewport culling,
 * sticky scroll, and acceleration — similar to our custom Ink ScrollBox.
 *
 * The imperative handle API is provided via SolidJS refs.
 */

import type { JSX } from '@opentui/solid'
import type { ScrollBoxRenderable } from '@opentui/core'

export interface ScrollBoxHandle {
  scrollTo(y: number): void
  scrollBy(dy: number): void
  scrollToBottom(): void
  getScrollTop(): number
  getScrollHeight(): number
  getViewportHeight(): number
  isSticky(): boolean
}

export interface ScrollBoxProps {
  // Layout (same as Box)
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  flexShrink?: number
  width?: number | string
  height?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  padding?: number
  gap?: number
  overflow?: 'visible' | 'hidden'

  // Scroll-specific
  stickyScroll?: boolean
  stickyStart?: 'bottom' | 'top' | 'left' | 'right'
  focused?: boolean

  // Ref for imperative API
  ref?: (handle: ScrollBoxRenderable) => void

  children?: JSX.Element
}

export function ScrollBox(props: ScrollBoxProps) {
  return (
    <scrollbox
      ref={props.ref}
      flexDirection={props.flexDirection}
      flexGrow={props.flexGrow}
      flexShrink={props.flexShrink}
      width={props.width as number}
      height={props.height as number}
      minHeight={props.minHeight as number}
      maxHeight={props.maxHeight as number}
      padding={props.padding}
      gap={props.gap}
      stickyScroll={props.stickyScroll}
      stickyStart={props.stickyStart}
      focused={props.focused}
    >
      {props.children}
    </scrollbox>
  )
}
