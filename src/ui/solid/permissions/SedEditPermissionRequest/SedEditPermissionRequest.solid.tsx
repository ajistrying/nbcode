import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { basename, relative } from 'path'
import { FileEditToolDiff } from 'src/components/FileEditToolDiff.js'
import { getCwd } from 'src/utils/cwd.js'
import { isENOENT } from 'src/utils/errors.js'
import { detectEncodingForResolvedPath } from 'src/utils/fileRead.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import { BashTool } from '../../../../tools/BashTool/BashTool.js'
import {
  applySedSubstitution,
  type SedEditInfo,
} from '../../../../tools/BashTool/sedEditParser.js'
import { FilePermissionDialog } from '../FilePermissionDialog/permissionOptions.solid.js'
import type { PermissionRequestProps } from '../PermissionRequest.solid.js'

type SedEditPermissionRequestProps = PermissionRequestProps & {
  sedInfo: SedEditInfo
}

type FileReadResult = {
  oldContent: string
  fileExists: boolean
}

/**
 * No stateful hooks (useMemo only -> computed values). Uses React 19 use() for async
 * file content in the original, approximated here with async read + Suspense fallback.
 */
export function SedEditPermissionRequest(
  props: SedEditPermissionRequestProps,
): JSX.Element {
  const { sedInfo, ...restProps } = props
  const { filePath } = sedInfo

  // The original uses a Suspense + use(promise) pattern.
  // For SolidJS we use createResource or similar; for now, provide the synchronous
  // inner component since the original also wraps in Suspense with null fallback.
  return <SedEditPermissionRequestInner sedInfo={sedInfo} {...restProps} />
}

function SedEditPermissionRequestInner(
  props: PermissionRequestProps & {
    sedInfo: SedEditInfo
  },
): JSX.Element {
  const { sedInfo } = props
  const { filePath } = sedInfo

  // Read file synchronously (matching the useMemo pattern)
  let oldContent: string
  let fileExists: boolean
  try {
    const encoding = detectEncodingForResolvedPath(filePath)
    // Note: in the original this is async, but for the port we use sync read
    const raw = require('fs').readFileSync(filePath, encoding) as string
    oldContent = raw.replaceAll('\r\n', '\n')
    fileExists = true
  } catch (e) {
    if (!isENOENT(e)) throw e
    oldContent = ''
    fileExists = false
  }

  const newContent = applySedSubstitution(oldContent, sedInfo)

  const edits = () => {
    if (oldContent === newContent) return []
    return [{ old_string: oldContent, new_string: newContent, replace_all: false }]
  }

  const noChangesMessage = !fileExists
    ? 'File does not exist'
    : 'Pattern did not match any content'

  function parseInput(input: unknown) {
    const parsed = BashTool.inputSchema.parse(input)
    return {
      ...parsed,
      _simulatedSedEdit: { filePath, newContent },
    }
  }

  const subtitle = relative(getCwd(), filePath)
  const fileName = basename(filePath)

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      title="Edit file"
      subtitle={subtitle}
      question={
        <text>
          Do you want to make this edit to{' '}
          <text><b>{fileName}</b></text>?
        </text>
      }
      content={
        edits().length > 0 ? (
          <FileEditToolDiff file_path={filePath} edits={edits()} />
        ) : (
          <text dimmed>{noChangesMessage}</text>
        )
      }
      path={filePath}
      completionType="str_replace_single"
      parseInput={parseInput}
      workerBadge={props.workerBadge}
    />
  )
}
