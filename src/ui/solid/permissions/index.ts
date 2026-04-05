// Top-level permissions
export { PermissionDialog } from './PermissionDialog.solid.js'
export { PermissionRuleExplanation } from './PermissionRuleExplanation.solid.js'
export type { PermissionRuleExplanationProps } from './PermissionRuleExplanation.solid.js'
export { PermissionRequestTitle } from './PermissionRequestTitle.solid.js'
export { PermissionRequest } from './PermissionRequest.solid.js'
export type { PermissionRequestProps, ToolUseConfirm } from './PermissionRequest.solid.js'
export { SandboxPermissionRequest } from './SandboxPermissionRequest.solid.js'
export type { SandboxPermissionRequestProps } from './SandboxPermissionRequest.solid.js'
export { WorkerBadge } from './WorkerBadge.solid.js'
export type { WorkerBadgeProps } from './WorkerBadge.solid.js'
export { WorkerPendingPermission } from './WorkerPendingPermission.solid.js'
export { generateShellSuggestionsLabel } from './shellPermissionHelpers.solid.js'

// New permission components
export { PermissionExplanation, usePermissionExplainerUI } from './PermissionExplanation.solid.js'
export { FallbackPermissionRequest } from './FallbackPermissionRequest.solid.js'
export { PermissionDecisionDebugInfo } from './PermissionDecisionDebugInfo.solid.js'
export { ComputerUseApproval } from './ComputerUseApproval/ComputerUseApproval.solid.js'
export { AskUserQuestionPermissionRequest } from './AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.solid.js'
export { QuestionView } from './AskUserQuestionPermissionRequest/QuestionView.solid.js'
export { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest.solid.js'
export { FileWriteToolDiff } from './FileWritePermissionRequest/FileWriteToolDiff.solid.js'
export { SedEditPermissionRequest } from './SedEditPermissionRequest/SedEditPermissionRequest.solid.js'
export { PermissionRuleInput } from './rules/PermissionRuleInput.solid.js'
export type { PermissionRuleInputProps } from './rules/PermissionRuleInput.solid.js'
export { WorkspaceTab } from './rules/WorkspaceTab.solid.js'

// Subdirectory permissions
export { SubmitQuestionsView } from './AskUserQuestionPermissionRequest/SubmitQuestionsView.solid.js'
export { bashToolUseOptions } from './BashPermissionRequest/bashToolUseOptions.js'
export type { BashToolUseOption } from './BashPermissionRequest/bashToolUseOptions.js'
export { EnterPlanModePermissionRequest } from './EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.solid.js'
export { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest.solid.js'
export {
  getFilePermissionOptions,
  isInClaudeFolder,
  isInGlobalClaudeFolder,
} from './FilePermissionDialog/permissionOptions.solid.js'
export type {
  PermissionOption,
  PermissionOptionWithLabel,
  FileOperationType,
} from './FilePermissionDialog/permissionOptions.solid.js'
export { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest.solid.js'
export { NotebookEditPermissionRequest } from './NotebookEditPermissionRequest/NotebookEditPermissionRequest.solid.js'
export { powershellToolUseOptions } from './PowerShellPermissionRequest/powershellToolUseOptions.js'
export type { PowerShellToolUseOption } from './PowerShellPermissionRequest/powershellToolUseOptions.js'
export { PermissionRuleDescription } from './rules/PermissionRuleDescription.solid.js'

// --- Ported batch (complex stateful permission components) ---

// File permission dialog
export { FilePermissionDialog } from './FilePermissionDialog.solid.js'
export type { FilePermissionDialogProps } from './FilePermissionDialog.solid.js'

// PowerShell permission request
export { PowerShellPermissionRequest as SolidPowerShellPermissionRequest } from './PowerShellPermissionRequest.solid.js'

// Add workspace directory
export { AddWorkspaceDirectory } from './AddWorkspaceDirectory.solid.js'

// Recent denials
export { RecentDenialsTab } from './RecentDenialsTab.solid.js'

// --- Ported batch (complex stateful, 7-16 hooks) ---

// Preview question view
export { PreviewQuestionView } from './PreviewQuestionView.solid.js'

// Bash permission request
export { BashPermissionRequest as SolidBashPermissionRequest } from './BashPermissionRequest.solid.js'

// Exit plan mode
export {
  ExitPlanModePermissionRequest as SolidExitPlanModePermissionRequest,
  buildPermissionUpdates,
  autoNameSessionFromPlan,
} from './ExitPlanModePermissionRequest.solid.js'

// Permission prompt
export {
  PermissionPrompt as SolidPermissionPrompt,
} from './PermissionPrompt.solid.js'
export type {
  PermissionPromptOption,
  PermissionPromptProps,
  FeedbackType,
  ToolAnalyticsContext,
} from './PermissionPrompt.solid.js'

// Permission rule list
export { PermissionRuleList as SolidPermissionRuleList } from './PermissionRuleList.solid.js'
