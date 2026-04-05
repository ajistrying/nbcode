/**
 * Barrel export for all SolidJS + OpenTUI primitive components.
 *
 * These are the building blocks for the migrated UI. Each component
 * accepts props similar to the Ink originals but renders via OpenTUI.
 *
 * Import paths:
 *   import { Box, Text, ScrollBox } from '../ui/solid/components/index.js'
 */

// Layout
export { Box, type BoxProps } from './Box.solid.js'
export { ScrollBox, type ScrollBoxProps, type ScrollBoxHandle } from './ScrollBox.solid.js'
export { AlternateScreen, type AlternateScreenProps } from './AlternateScreen.solid.js'

// Text
export { Text, type TextProps } from './Text.solid.js'

// Interactive
export { Button, type ButtonProps, type ButtonState } from './Button.solid.js'

// Simple
export {
  Spacer,
  Newline, type NewlineProps,
  Link, type LinkProps,
  RawAnsi, type RawAnsiProps,
  NoSelect, type NoSelectProps,
  ErrorOverview, type ErrorBoundaryProps,
} from './simple.solid.js'

// App shell
export { App, type AppProps } from './App.solid.js'

// --- Ported presentational components ---

// Agent / progress
export { AgentProgressLine } from './AgentProgressLine.solid.js'
export { ToolUseLoader } from './ToolUseLoader.solid.js'
export { BashModeProgress } from './BashModeProgress.solid.js'

// App wrapper
export { AppWrapper } from './AppWrapper.solid.js'

// API key
export { ApproveApiKey } from './ApproveApiKey.solid.js'

// Channel
export { ChannelDowngradeDialog, type ChannelDowngradeChoice } from './ChannelDowngradeDialog.solid.js'

// Image
export { ClickableImageRef } from './ClickableImageRef.solid.js'

// Summary
export { CompactSummary } from './CompactSummary.solid.js'

// Shortcuts
export { ConfigurableShortcutHint } from './ConfigurableShortcutHint.solid.js'

// Context
export { ContextSuggestions } from './ContextSuggestions.solid.js'
export { ContextVisualization } from './ContextVisualization.solid.js'

// Dialogs
export { CostThresholdDialog } from './CostThresholdDialog.solid.js'
export { IdleReturnDialog } from './IdleReturnDialog.solid.js'
export { InvalidConfigDialog } from './InvalidConfigDialog.solid.js'
export { InvalidSettingsDialog } from './InvalidSettingsDialog.solid.js'
export { IdeOnboardingDialog } from './IdeOnboardingDialog.solid.js'
export { UltraplanLaunchDialog } from './UltraplanLaunchDialog.solid.js'
export { MCPServerApprovalDialog } from './MCPServerApprovalDialog.solid.js'
export { ThemePicker } from './ThemePicker.solid.js'

// Expand / collapse
export { CtrlOToExpand, SubAgentProvider, ctrlOToExpand } from './CtrlOToExpand.solid.js'

// Diagnostics
export { DiagnosticsDisplay } from './DiagnosticsDisplay.solid.js'

// Exit
export { ExitFlow } from './ExitFlow.solid.js'

// Fallback tool messages
export { FallbackToolUseErrorMessage } from './FallbackToolUseErrorMessage.solid.js'
export { FallbackToolUseRejectedMessage } from './FallbackToolUseRejectedMessage.solid.js'

// Fast mode
export { FastIcon, getFastIconString } from './FastIcon.solid.js'

// File editing
export { FileEditToolUpdatedMessage } from './FileEditToolUpdatedMessage.solid.js'
export { FileEditToolUseRejectedMessage } from './FileEditToolUseRejectedMessage.solid.js'

// File path
export { FilePathLink } from './FilePathLink.solid.js'

// IDE
export { IdeStatusIndicator } from './IdeStatusIndicator.solid.js'

// Interrupted
export { InterruptedByUser } from './InterruptedByUser.solid.js'

// Keybindings
export { KeybindingWarnings } from './KeybindingWarnings.solid.js'

// Markdown
export { MarkdownTable } from './MarkdownTable.solid.js'

// MCP
export { MCPServerDialogCopy } from './MCPServerDialogCopy.solid.js'

// Message
export { Message } from './Message.solid.js'
export { MessageModel } from './MessageModel.solid.js'
export { MessageResponse } from './MessageResponse.solid.js'
export { MessageRow } from './MessageRow.solid.js'
export { MessageTimestamp } from './MessageTimestamp.solid.js'

// Notebook
export { NotebookEditToolUseRejectedMessage } from './NotebookEditToolUseRejectedMessage.solid.js'

// PR
export { PrBadge } from './PrBadge.solid.js'

// Prompts
export { PressEnterToContinue } from './PressEnterToContinue.solid.js'
export { ShowInIDEPrompt } from './ShowInIDEPrompt.solid.js'

// Search
export { SearchBox } from './SearchBox.solid.js'

// Status
export { StatusNotices } from './StatusNotices.solid.js'

// Diff
export { StructuredDiff } from './StructuredDiff.solid.js'
export { StructuredDiffList } from './StructuredDiffList.solid.js'

// Tabs
export { TagTabs } from './TagTabs.solid.js'

// Teammate
export { TeammateViewHeader } from './TeammateViewHeader.solid.js'

// Token
export { TokenWarning } from './TokenWarning.solid.js'

// Validation
export { ValidationErrorsList } from './ValidationErrorsList.solid.js'

// --- Ported batch (dialogs, system, inputs) ---
export { AutoModeOptInDialog, AUTO_MODE_DESCRIPTION } from './AutoModeOptInDialog.solid.js'
export { AutoUpdaterWrapper } from './AutoUpdaterWrapper.solid.js'
export { AwsAuthStatusBox } from './AwsAuthStatusBox.solid.js'
export { BaseTextInput } from './BaseTextInput.solid.js'
export { BypassPermissionsModeDialog } from './BypassPermissionsModeDialog.solid.js'
export { ClaudeMdExternalIncludesDialog } from './ClaudeMdExternalIncludesDialog.solid.js'
export { DevBar } from './DevBar.solid.js'
export { ExportDialog } from './ExportDialog.solid.js'
export { OffscreenFreeze } from './OffscreenFreeze.solid.js'
export { ThinkingToggle, type Props as ThinkingToggleProps } from './ThinkingToggle.solid.js'
export { WorkflowMultiselectDialog } from './WorkflowMultiselectDialog.solid.js'
export { WorktreeExitDialog } from './WorktreeExitDialog.solid.js'

// --- Ported batch (MCP, dialogs, pickers, inputs, markdown, hints) ---

// Chrome onboarding
export { ClaudeInChromeOnboarding } from './ClaudeInChromeOnboarding.solid.js'

// Diff
export { FileEditToolDiff } from './FileEditToolDiff.solid.js'

// Code
export { HighlightedCode } from './HighlightedCode.solid.js'

// History
export { HistorySearchDialog } from './HistorySearchDialog.solid.js'

// Language
export { LanguagePicker } from './LanguagePicker.solid.js'

// Text input
export { default as TextInput } from './TextInput.solid.js'
export { default as VimTextInput } from './VimTextInput.solid.js'

// Ultraplan
export { UltraplanChoiceDialog } from './UltraplanChoiceDialog.solid.js'

// Model picker
export { ModelPicker } from './ModelPicker.solid.js'

// Auto updater
export { NativeAutoUpdater } from './NativeAutoUpdater.solid.js'
export { PackageManagerAutoUpdater } from './PackageManagerAutoUpdater.solid.js'

// Output style
export { OutputStylePicker } from './OutputStylePicker.solid.js'

// Markdown
export { Markdown, StreamingMarkdown } from './Markdown.solid.js'

// LSP
export { LspRecommendationMenu } from './LspRecommendationMenu.solid.js'

// Plugin hints
export { PluginHintMenu } from './PluginHintMenu.solid.js'

// --- Session / Settings / Teleport / Misc ---

// Sandbox
export { SandboxViolationExpandedView } from './SandboxViolationExpandedView.solid.js'

// Session
export { SessionBackgroundHint } from './SessionBackgroundHint.solid.js'
export { SessionPreview } from './SessionPreview.solid.js'

// Settings
export { Usage } from './Usage.solid.js'

// Teleport
export { TeleportError, getTeleportErrors } from './TeleportError.solid.js'
export type { TeleportLocalErrorType } from './TeleportError.solid.js'
export { TeleportRepoMismatchDialog } from './TeleportRepoMismatchDialog.solid.js'
export { TeleportResumeWrapper } from './TeleportResumeWrapper.solid.js'
export { TeleportStash } from './TeleportStash.solid.js'

// Skill survey
export { SkillImprovementSurvey } from './SkillImprovementSurvey.solid.js'

// Trust
export { TrustDialog } from './TrustDialog.solid.js'

// Tree select
export { TreeSelect } from './TreeSelect.solid.js'
export type { TreeNode, TreeSelectProps } from './TreeSelect.solid.js'

// Desktop upsell
export { DesktopUpsellStartup, shouldShowDesktopUpsellStartup, getDesktopUpsellConfig } from './DesktopUpsellStartup.solid.js'

// --- Ported batch (complex stateful components) ---

// Bridge
export { BridgeDialog } from './BridgeDialog.solid.js'

// Coordinator
export { CoordinatorTaskPanel } from './CoordinatorAgentStatus.solid.js'

// Custom Select
export { SelectInputOption } from './SelectInputOption.solid.js'
export { Select as SolidSelect } from './Select.solid.js'

// Diff
export { DiffDialog } from './DiffDialog.solid.js'

// Feedback
export { Feedback, redactSensitiveInfo as solidRedactSensitiveInfo, createGitHubIssueUrl as solidCreateGitHubIssueUrl } from './Feedback.solid.js'

// Memory
export { MemoryFileSelector } from './MemoryFileSelector.solid.js'

// Message actions
export {
  MessageActionsBar,
  MessageActionsKeybindings,
  MessageActionsSelectedContext,
  InVirtualListContext,
  useSelectedMessageBg,
  createMessageActions,
} from './messageActions.solid.js'

// Onboarding
export { Onboarding, SkippableStep } from './Onboarding.solid.js'

// Resume
export { ResumeTask } from './ResumeTask.solid.js'

// --- Ported batch (complex stateful, 4-6 hooks) ---

// Auto updater
export { AutoUpdater } from './AutoUpdater.solid.js'

// Desktop handoff
export { DesktopHandoff, getDownloadUrl } from './DesktopHandoff.solid.js'

// Effort callout
export { EffortCallout, shouldShowEffortCallout } from './EffortCallout.solid.js'

// Grove
export { GroveDialog, PrivacySettingsDialog } from './Grove.solid.js'
export type { GroveDecision } from './Grove.solid.js'

// Passes
export { Passes } from './Passes.solid.js'

// Remote callout
export { RemoteCallout, shouldShowRemoteCallout } from './RemoteCallout.solid.js'

// Wizard provider
export { WizardProvider, WizardContext } from './WizardProvider.solid.js'

// Settings
export { Settings } from './Settings.solid.js'

// --- Ported batch (complex stateful, 7-16 hooks) ---

// Console OAuth
export { ConsoleOAuthFlow } from './ConsoleOAuthFlow.solid.js'

// Fullscreen layout
export {
  FullscreenLayout,
  ScrollChromeContext,
  useUnseenDivider,
  countUnseenAssistantTurns,
  computeUnseenDivider,
} from './FullscreenLayout.solid.js'
export type { UnseenDivider } from './FullscreenLayout.solid.js'

// Global search
export { GlobalSearchDialog, parseRipgrepLine } from './GlobalSearchDialog.solid.js'

// Quick open
export { QuickOpenDialog } from './QuickOpenDialog.solid.js'

// --- Ported batch (heaviest components, 15-82 hooks) ---

// Messages
export { Messages, filterForBriefTool, dropTextInBriefTurns } from './Messages.solid.js'

// Message selector
export { MessageSelector } from './MessageSelector.solid.js'

// Virtual message list
export { VirtualMessageList } from './VirtualMessageList.solid.js'
export type { JumpHandle, StickyPrompt } from './VirtualMessageList.solid.js'

// Log selector
export { LogSelector } from './LogSelector.solid.js'
export type { LogSelectorProps } from './LogSelector.solid.js'

// Scroll keybinding handler
export { ScrollKeybindingHandler, shouldClearSelectionOnKey, selectionFocusMoveForKey, computeWheelStep } from './ScrollKeybindingHandler.solid.js'
export type { WheelAccelState } from './ScrollKeybindingHandler.solid.js'

// Config (Settings panel)
export { Config } from './Config.solid.js'

// Stats
export { Stats } from './Stats.solid.js'

// Status line
export { StatusLine, statusLineShouldDisplay, getLastAssistantMessageId } from './StatusLine.solid.js'

// Teams dialog
export { TeamsDialog } from './TeamsDialog.solid.js'

// Remote environment dialog
export { RemoteEnvironmentDialog } from './RemoteEnvironmentDialog.solid.js'
