/**
 * Design system barrel export for SolidJS + OpenTUI.
 *
 * These components mirror the React design system at
 * src/components/design-system/ but use SolidJS reactivity
 * and OpenTUI rendering.
 */

// Theme
export {
  ThemeProvider,
  useTheme,
  useThemeColors,
  resolveColor,
} from './ThemeProvider.solid.js'

// Core themed primitives
export { ThemedText, type ThemedTextProps } from './ThemedText.solid.js'
export { ThemedBox, type ThemedBoxProps } from './ThemedBox.solid.js'

// Design system components
export { Divider } from './Divider.solid.js'
export { StatusIcon } from './StatusIcon.solid.js'
export { ProgressBar } from './ProgressBar.solid.js'
export { Byline } from './Byline.solid.js'
export { Dialog } from './Dialog.solid.js'
export { KeyboardShortcutHint } from './KeyboardShortcutHint.solid.js'
export { ListItem } from './ListItem.solid.js'
export { LoadingState } from './LoadingState.solid.js'
export { Pane } from './Pane.solid.js'

// Ported batch
export { Ratchet } from './Ratchet.solid.js'

// FuzzyPicker
export { FuzzyPicker } from './FuzzyPicker.solid.js'

// Tabs
export { Tabs, Tab, useTabsWidth, useTabHeaderFocus } from './Tabs.solid.js'
