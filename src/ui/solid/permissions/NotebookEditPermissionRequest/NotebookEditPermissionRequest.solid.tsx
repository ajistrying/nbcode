import type { JSX } from '@opentui/solid'
import { basename } from 'path'
import type { z } from 'zod/v4'
import { NotebookEditTool } from '../../../../tools/NotebookEditTool/NotebookEditTool.js'
import { logError } from '../../../../utils/log.js'
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js'
import type { PermissionRequestProps } from '../PermissionRequest.solid.js'
import { NotebookEditToolDiff } from './NotebookEditToolDiff.js'

type NotebookEditInput = z.infer<typeof NotebookEditTool.inputSchema>

export function NotebookEditPermissionRequest(props: PermissionRequestProps): JSX.Element {
  const parseInput = (input: unknown): NotebookEditInput => {
    const result = NotebookEditTool.inputSchema.safeParse(input)
    if (!result.success) {
      logError(
        new Error(
          `Failed to parse notebook edit input: ${result.error.message}`,
        ),
      )
      // Return a default value to avoid crashing
      return {
        notebook_path: '',
        new_source: '',
        cell_id: '',
      } as NotebookEditInput
    }
    return result.data
  }

  const parsed = parseInput(props.toolUseConfirm.input)
  const { notebook_path, edit_mode, cell_type } = parsed

  const language = cell_type === 'markdown' ? 'markdown' : 'python'

  const editTypeText =
    edit_mode === 'insert'
      ? 'insert this cell into'
      : edit_mode === 'delete'
        ? 'delete this cell from'
        : 'make this edit to'

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title="Edit notebook"
      question={
        <text>
          Do you want to {editTypeText}{' '}
          <text><b>{basename(notebook_path)}</b></text>?
        </text>
      }
      content={
        <NotebookEditToolDiff
          notebook_path={parsed.notebook_path}
          cell_id={parsed.cell_id}
          new_source={parsed.new_source}
          cell_type={parsed.cell_type}
          edit_mode={parsed.edit_mode}
          verbose={props.verbose}
          width={props.verbose ? 120 : 80}
        />
      }
      path={notebook_path}
      completionType="tool_use_single"
      languageName={language}
      parseInput={parseInput}
    />
  )
}
