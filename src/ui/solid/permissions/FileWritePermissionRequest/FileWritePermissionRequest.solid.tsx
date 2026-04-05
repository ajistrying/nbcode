import type { JSX } from '@opentui/solid'
import { basename, relative } from 'path'
import type { z } from 'zod/v4'
import { FileWriteTool } from '../../../../tools/FileWriteTool/FileWriteTool.js'
import { getCwd } from '../../../../utils/cwd.js'
import { isENOENT } from '../../../../utils/errors.js'
import { readFileSync } from '../../../../utils/fileRead.js'
import { FilePermissionDialog } from '../FilePermissionDialog/permissionOptions.solid.js'
import {
  createSingleEditDiffConfig,
  type FileEdit,
  type IDEDiffSupport,
} from '../../../../components/permissions/FilePermissionDialog/ideDiffConfig.js'
import type { PermissionRequestProps } from '../PermissionRequest.solid.js'
import { FileWriteToolDiff } from './FileWriteToolDiff.solid.js'

type FileWriteToolInput = z.infer<typeof FileWriteTool.inputSchema>

const ideDiffSupport: IDEDiffSupport<FileWriteToolInput> = {
  getConfig: (input: FileWriteToolInput) => {
    let oldContent: string
    try {
      oldContent = readFileSync(input.file_path)
    } catch (e) {
      if (!isENOENT(e)) throw e
      oldContent = ''
    }
    return createSingleEditDiffConfig(input.file_path, oldContent, input.content, false)
  },
  applyChanges: (input: FileWriteToolInput, modifiedEdits: FileEdit[]) => {
    const firstEdit = modifiedEdits[0]
    if (firstEdit) {
      return { ...input, content: firstEdit.new_string }
    }
    return input
  },
}

function parseInput(input: unknown): FileWriteToolInput {
  return FileWriteTool.inputSchema.parse(input)
}

/**
 * No stateful hooks in original (useMemo only -> computed at creation).
 */
export function FileWritePermissionRequest(props: PermissionRequestProps): JSX.Element {
  const parsed = parseInput(props.toolUseConfirm.input)
  const { file_path, content } = parsed

  let fileExists: boolean
  let oldContent: string
  try {
    oldContent = readFileSync(file_path)
    fileExists = true
  } catch (e) {
    if (!isENOENT(e)) throw e
    oldContent = ''
    fileExists = false
  }

  const actionText = fileExists ? 'overwrite' : 'create'
  const title = fileExists ? 'Overwrite file' : 'Create file'
  const subtitle = relative(getCwd(), file_path)
  const fileName = basename(file_path)

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title={title}
      subtitle={subtitle}
      question={
        <text>
          Do you want to {actionText} <text><b>{fileName}</b></text>?
        </text>
      }
      content={
        <FileWriteToolDiff
          file_path={file_path}
          content={content}
          fileExists={fileExists}
          oldContent={oldContent}
        />
      }
      path={file_path}
      completionType="write_file_single"
      parseInput={parseInput}
      ideDiffSupport={ideDiffSupport}
    />
  )
}
