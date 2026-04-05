import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import { EnterPlanModeTool } from 'src/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { ExitPlanModeV2Tool } from 'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { useNotifyAfterTimeout } from '../../../hooks/useNotifyAfterTimeout.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import type { AnyObject, Tool, ToolUseContext } from '../../../Tool.js'
import { AskUserQuestionTool } from '../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import { FileEditTool } from '../../../tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../../../tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../../../tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '../../../tools/GlobTool/GlobTool.js'
import { GrepTool } from '../../../tools/GrepTool/GrepTool.js'
import { NotebookEditTool } from '../../../tools/NotebookEditTool/NotebookEditTool.js'
import { PowerShellTool } from '../../../tools/PowerShellTool/PowerShellTool.js'
import { SkillTool } from '../../../tools/SkillTool/SkillTool.js'
import { WebFetchTool } from '../../../tools/WebFetchTool/WebFetchTool.js'
import type { AssistantMessage } from '../../../types/message.js'
import type { PermissionDecision } from '../../../utils/permissions/PermissionResult.js'
import { AskUserQuestionPermissionRequest } from './AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.js'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest.js'
import { EnterPlanModePermissionRequest } from './EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.solid.js'
import { ExitPlanModePermissionRequest } from './ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import { FallbackPermissionRequest } from './FallbackPermissionRequest.js'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest.solid.js'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest.solid.js'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest.js'
import { NotebookEditPermissionRequest } from './NotebookEditPermissionRequest/NotebookEditPermissionRequest.solid.js'
import { PowerShellPermissionRequest } from './PowerShellPermissionRequest/PowerShellPermissionRequest.js'
import { SkillPermissionRequest } from './SkillPermissionRequest/SkillPermissionRequest.js'
import { WebFetchPermissionRequest } from './WebFetchPermissionRequest/WebFetchPermissionRequest.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const ReviewArtifactTool = feature('REVIEW_ARTIFACT') ? (require('../../../tools/ReviewArtifactTool/ReviewArtifactTool.js') as typeof import('../../../tools/ReviewArtifactTool/ReviewArtifactTool.js')).ReviewArtifactTool : null
const ReviewArtifactPermissionRequest = feature('REVIEW_ARTIFACT') ? (require('./ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js') as typeof import('./ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js')).ReviewArtifactPermissionRequest : null
const WorkflowTool = feature('WORKFLOW_SCRIPTS') ? (require('../../../tools/WorkflowTool/WorkflowTool.js') as typeof import('../../../tools/WorkflowTool/WorkflowTool.js')).WorkflowTool : null
const WorkflowPermissionRequest = feature('WORKFLOW_SCRIPTS') ? (require('../../../tools/WorkflowTool/WorkflowPermissionRequest.js') as typeof import('../../../tools/WorkflowTool/WorkflowPermissionRequest.js')).WorkflowPermissionRequest : null
const MonitorTool = feature('MONITOR_TOOL') ? (require('../../../tools/MonitorTool/MonitorTool.js') as typeof import('../../../tools/MonitorTool/MonitorTool.js')).MonitorTool : null
const MonitorPermissionRequest = feature('MONITOR_TOOL') ? (require('./MonitorPermissionRequest/MonitorPermissionRequest.js') as typeof import('./MonitorPermissionRequest/MonitorPermissionRequest.js')).MonitorPermissionRequest : null
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
/* eslint-enable @typescript-eslint/no-require-imports */
import type { z } from 'zod/v4'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import type { WorkerBadgeProps } from './WorkerBadge.solid.js'

function permissionComponentForTool(tool: Tool): any {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest
    case FileWriteTool:
      return FileWritePermissionRequest
    case BashTool:
      return BashPermissionRequest
    case PowerShellTool:
      return PowerShellPermissionRequest
    case ReviewArtifactTool:
      return ReviewArtifactPermissionRequest ?? FallbackPermissionRequest
    case WebFetchTool:
      return WebFetchPermissionRequest
    case NotebookEditTool:
      return NotebookEditPermissionRequest
    case ExitPlanModeV2Tool:
      return ExitPlanModePermissionRequest
    case EnterPlanModeTool:
      return EnterPlanModePermissionRequest
    case SkillTool:
      return SkillPermissionRequest
    case AskUserQuestionTool:
      return AskUserQuestionPermissionRequest
    case WorkflowTool:
      return WorkflowPermissionRequest ?? FallbackPermissionRequest
    case MonitorTool:
      return MonitorPermissionRequest ?? FallbackPermissionRequest
    case GlobTool:
    case GrepTool:
    case FileReadTool:
      return FilesystemPermissionRequest
    default:
      return FallbackPermissionRequest
  }
}

export type PermissionRequestProps<Input extends AnyObject = AnyObject> = {
  toolUseConfirm: ToolUseConfirm<Input>
  toolUseContext: ToolUseContext
  onDone(): void
  onReject(): void
  verbose: boolean
  workerBadge: WorkerBadgeProps | undefined
  setStickyFooter?: (jsx: JSX.Element | null) => void
}

export type ToolUseConfirm<Input extends AnyObject = AnyObject> = {
  assistantMessage: AssistantMessage
  tool: Tool<Input>
  description: string
  input: z.infer<Input>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult: PermissionDecision
  permissionPromptStartTimeMs: number
  classifierCheckInProgress?: boolean
  classifierAutoApproved?: boolean
  classifierMatchedRule?: string
  workerBadge?: WorkerBadgeProps
  onUserInteraction(): void
  onAbort(): void
  onDismissCheckmark?(): void
  onAllow(updatedInput: z.infer<Input>, permissionUpdates: PermissionUpdate[], feedback?: string, contentBlocks?: ContentBlockParam[]): void
  onReject(feedback?: string, contentBlocks?: ContentBlockParam[]): void
  recheckPermission(): Promise<void>
}

function getNotificationMessage(toolUseConfirm: ToolUseConfirm): string {
  const toolName = toolUseConfirm.tool.userFacingName(toolUseConfirm.input as never)
  if (toolUseConfirm.tool === ExitPlanModeV2Tool) {
    return 'Noble Base Code needs your approval for the plan'
  }
  if (toolUseConfirm.tool === EnterPlanModeTool) {
    return 'Noble Base Code wants to enter plan mode'
  }
  if (feature('REVIEW_ARTIFACT') && toolUseConfirm.tool === ReviewArtifactTool) {
    return 'Noble Base Code needs your approval for a review artifact'
  }
  if (!toolName || toolName.trim() === '') {
    return 'Noble Base Code needs your attention'
  }
  return `Claude needs your permission to use ${toolName}`
}

// TODO: Move this to Tool.renderPermissionRequest
export function PermissionRequest(props: PermissionRequestProps): JSX.Element {
  const handleEscape = () => {
    props.onDone()
    props.onReject()
    props.toolUseConfirm.onReject()
  }

  useKeybinding('app:interrupt', handleEscape, { context: 'Confirmation' })

  const notificationMessage = getNotificationMessage(props.toolUseConfirm)
  useNotifyAfterTimeout(notificationMessage, 'permission_prompt')

  const PermissionComponent = permissionComponentForTool(props.toolUseConfirm.tool)

  return (
    <PermissionComponent
      toolUseContext={props.toolUseContext}
      toolUseConfirm={props.toolUseConfirm}
      onDone={props.onDone}
      onReject={props.onReject}
      verbose={props.verbose}
      workerBadge={props.workerBadge}
      setStickyFooter={props.setStickyFooter}
    />
  )
}
