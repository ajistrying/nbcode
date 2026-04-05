/**
 * Shared UI primitive prop types for the React+Ink → OpenTUI+SolidJS migration.
 *
 * These types abstract over both rendering backends so that higher-level
 * component logic can be written once and rendered by either system.
 *
 * During the transition:
 *   • Ink components import from here and map to `<Box>` / `<Text>` etc.
 *   • Solid components import from here and map to `<box>` / `<text>` etc.
 *
 * After the migration only the Solid mapping survives, and these types
 * can be replaced with direct OpenTUI prop types.
 */

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/**
 * Portable color value accepted by both Ink and OpenTUI.
 * Hex strings are the safest cross-backend choice.
 */
export type Color = string

// ---------------------------------------------------------------------------
// Layout (Box / box)
// ---------------------------------------------------------------------------

export interface LayoutProps {
  // Flex
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  flexShrink?: number
  flexWrap?: boolean

  // Size
  width?: number | string
  height?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  maxHeight?: number | string

  // Spacing
  padding?: number | { top?: number; bottom?: number; left?: number; right?: number }
  margin?: number | { top?: number; bottom?: number; left?: number; right?: number }
  gap?: number | { row?: number; column?: number }

  // Position
  position?: 'absolute' | 'relative'
  top?: number | string
  bottom?: number | string
  left?: number | string
  right?: number | string

  // Border (OpenTUI style names)
  borderStyle?: 'single' | 'double' | 'rounded' | 'heavy' | 'none'
  borderColor?: Color

  // Interaction (subset both backends support)
  tabIndex?: number
  onClick?: (event: unknown) => void
}

// ---------------------------------------------------------------------------
// Text (Text / text)
// ---------------------------------------------------------------------------

export interface TextStyleProps {
  color?: Color
  backgroundColor?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean

  /**
   * Text wrapping mode.
   *   Ink:     'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start'
   *   OpenTUI: Similar but uses Yoga's text wrapping
   */
  wrap?: 'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start'
}

// ---------------------------------------------------------------------------
// ScrollBox (ScrollBox / scrollbox)
// ---------------------------------------------------------------------------

export interface ScrollProps extends LayoutProps {
  stickyScroll?: boolean
}

/** Imperative handle that both backends' scroll containers expose. */
export interface ScrollHandle {
  scrollTo(y: number): void
  scrollBy(dy: number): void
  scrollToBottom(): void
  getScrollTop(): number
  getScrollHeight(): number
  getViewportHeight(): number
  isSticky(): boolean
}

// ---------------------------------------------------------------------------
// Input (custom / <input> + <textarea>)
// ---------------------------------------------------------------------------

export interface SingleLineInputProps {
  value?: string
  placeholder?: string
  focused?: boolean
  onInput?: (value: string) => void
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
}

export interface MultiLineInputProps {
  value?: string
  placeholder?: string
  focused?: boolean
  onContentChange?: (value: string) => void
  onSubmit?: () => void
}

// ---------------------------------------------------------------------------
// Select (custom / <select>)
// ---------------------------------------------------------------------------

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  focused?: boolean
  onChange?: (index: number, option: SelectOption | null) => void
  onSelect?: (index: number, option: SelectOption | null) => void
}

// ---------------------------------------------------------------------------
// Code / Diff / Markdown — OpenTUI built-ins (no Ink equivalent)
// ---------------------------------------------------------------------------

export interface CodeBlockProps {
  content: string
  filetype?: string
}

export interface DiffProps {
  content: string
}

export interface MarkdownProps {
  content: string
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type {
  LayoutProps as BoxProps,
  TextStyleProps as TextProps,
  ScrollProps as ScrollBoxProps,
}
