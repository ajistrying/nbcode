/**
 * SolidJS + OpenTUI UI layer — top-level barrel export.
 *
 * Usage:
 *   import { Box, Text, ThemedText, useKeyboard } from '../ui/solid/index.js'
 *   import { render } from '@opentui/solid'
 */

// Primitive components
export * from './components/index.js'

// Design system (themed components)
export * from './design-system/index.js'

// Hooks
export * from './hooks.js'

// MCP components
export * from './mcp/index.js'

// Hooks components
export * from './hooks/index.js'

// PromptInput
export * from './PromptInput/index.js'

// Spinner
export * from './Spinner/index.js'

// Tasks
export * from './tasks/index.js'

// Agents
export * from './agents/index.js'

// FeedbackSurvey hooks
export * from './FeedbackSurvey/index.js'

// Screens
export * from './screens/index.js'

// Re-export render for convenience
export { render, testRender } from '@opentui/solid'
