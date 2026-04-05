import type { JSX } from '@opentui/solid'
import { useTheme } from '../../../../ink.js'
import { FallbackPermissionRequest } from '../FallbackPermissionRequest.js'
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js'
import type { ToolInput } from '../FilePermissionDialog/useFilePermissionDialog.js'
import type { PermissionRequestProps, ToolUseConfirm } from '../PermissionRequest.solid.js'

function pathFromToolUse(toolUseConfirm: ToolUseConfirm): string | null {
  const tool = toolUseConfirm.tool
  if ('getPath' in tool && typeof tool.getPath === 'function') {
    try {
      return tool.getPath(toolUseConfirm.input)
    } catch {
      return null
    }
  }
  return null
}

export function FilesystemPermissionRequest(props: PermissionRequestProps): JSX.Element {
  const [theme] = useTheme()
  const path = pathFromToolUse(props.toolUseConfirm)
  const userFacingName = props.toolUseConfirm.tool.userFacingName(
    props.toolUseConfirm.input as never,
  )

  const isReadOnly = props.toolUseConfirm.tool.isReadOnly(props.toolUseConfirm.input)
  const userFacingReadOrEdit = isReadOnly ? 'Read' : 'Edit'

  // Use simple singular form - the actual operation details are shown in content
  const title = `${userFacingReadOrEdit} file`

  // Simple pass-through parser since we don't need to transform the input
  const parseInput = (input: unknown): ToolInput => input as ToolInput

  // Fall back to generic permission request if no path is found
  if (!path) {
    return (
      <FallbackPermissionRequest
        toolUseConfirm={props.toolUseConfirm}
        toolUseContext={props.toolUseContext}
        onDone={props.onDone}
        onReject={props.onReject}
        verbose={props.verbose}
        workerBadge={props.workerBadge}
      />
    )
  }

  // Render tool use message content
  const content = (
    <box flexDirection="column" paddingX={2} paddingY={1}>
      <text>
        {userFacingName}(
        {props.toolUseConfirm.tool.renderToolUseMessage(
          props.toolUseConfirm.input as never,
          { theme, verbose: props.verbose },
        )}
        )
      </text>
    </box>
  )

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title={title}
      content={content}
      path={path}
      parseInput={parseInput}
      operationType={isReadOnly ? 'read' : 'write'}
      completionType="tool_use_single"
    />
  )
}
