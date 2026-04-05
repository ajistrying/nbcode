import type { JSX } from '@opentui/solid'
import { createSignal, Show, Suspense } from 'solid-js'
import type { StructuredPatchHunk } from 'diff'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { FileEdit } from '../../../tools/FileEditTool/types.js'
import {
  findActualString,
  preserveQuoteStyle,
} from '../../../tools/FileEditTool/utils.js'
import {
  adjustHunkLineNumbers,
  CONTEXT_LINES,
  getPatchForDisplay,
} from '../../../utils/diff.js'
import { logError } from '../../../utils/log.js'
import {
  CHUNK_SIZE,
  openForScan,
  readCapped,
  scanForContext,
} from '../../../utils/readEditContext.js'
import { firstLineOf } from '../../../utils/stringUtils.js'
import { StructuredDiffList } from './StructuredDiffList.solid.js'

type Props = {
  file_path: string
  edits: FileEdit[]
}

type DiffData = {
  patch: StructuredPatchHunk[]
  firstLine: string | null
  fileContent: string | undefined
}

export function FileEditToolDiff(props: Props): JSX.Element {
  // Snapshot on mount
  const [dataPromise] = createSignal(
    loadDiffData(props.file_path, props.edits),
  )

  return (
    <Suspense fallback={<DiffFrame placeholder />}>
      <DiffBody promise={dataPromise()} file_path={props.file_path} />
    </Suspense>
  )
}

function DiffBody(props: {
  promise: Promise<DiffData>
  file_path: string
}): JSX.Element {
  const [data, setData] = createSignal<DiffData | null>(null)
  const { columns } = useTerminalSize()

  props.promise.then(setData)

  return (
    <Show when={data()} fallback={<DiffFrame placeholder />}>
      {(d) => (
        <DiffFrame>
          <StructuredDiffList
            hunks={d().patch}
            dim={false}
            width={columns}
            filePath={props.file_path}
            firstLine={d().firstLine}
            fileContent={d().fileContent}
          />
        </DiffFrame>
      )}
    </Show>
  )
}

function DiffFrame(props: {
  children?: JSX.Element
  placeholder?: boolean
}): JSX.Element {
  return (
    <box flexDirection="column">
      <box
        borderColor="subtle"
        borderStyle="dashed"
        flexDirection="column"
        borderLeft={false}
        borderRight={false}
      >
        <Show when={!props.placeholder} fallback={<text dimmed>...</text>}>
          {props.children}
        </Show>
      </box>
    </box>
  )
}

async function loadDiffData(
  file_path: string,
  edits: FileEdit[],
): Promise<DiffData> {
  const valid = edits.filter(e => e.old_string != null && e.new_string != null)
  const single = valid.length === 1 ? valid[0]! : undefined

  if (single && single.old_string.length >= CHUNK_SIZE) {
    return diffToolInputsOnly(file_path, [single])
  }

  try {
    const handle = await openForScan(file_path)
    if (handle === null) return diffToolInputsOnly(file_path, valid)
    try {
      if (!single || single.old_string === '') {
        const file = await readCapped(handle)
        if (file === null) return diffToolInputsOnly(file_path, valid)
        const normalized = valid.map(e => normalizeEdit(file, e))
        return {
          patch: getPatchForDisplay({
            filePath: file_path,
            fileContents: file,
            edits: normalized,
          }),
          firstLine: firstLineOf(file),
          fileContent: file,
        }
      }

      const ctx = await scanForContext(handle, single.old_string, CONTEXT_LINES)
      if (ctx.truncated || ctx.content === '') {
        return diffToolInputsOnly(file_path, [single])
      }
      const normalized = normalizeEdit(ctx.content, single)
      const hunks = getPatchForDisplay({
        filePath: file_path,
        fileContents: ctx.content,
        edits: [normalized],
      })
      return {
        patch: adjustHunkLineNumbers(hunks, ctx.lineOffset - 1),
        firstLine: ctx.lineOffset === 1 ? firstLineOf(ctx.content) : null,
        fileContent: ctx.content,
      }
    } finally {
      await handle.close()
    }
  } catch (e) {
    logError(e as Error)
    return diffToolInputsOnly(file_path, valid)
  }
}

function diffToolInputsOnly(filePath: string, edits: FileEdit[]): DiffData {
  return {
    patch: edits.flatMap(e =>
      getPatchForDisplay({
        filePath,
        fileContents: e.old_string,
        edits: [e],
      }),
    ),
    firstLine: null,
    fileContent: undefined,
  }
}

function normalizeEdit(fileContent: string, edit: FileEdit): FileEdit {
  const actualOld =
    findActualString(fileContent, edit.old_string) || edit.old_string
  const actualNew = preserveQuoteStyle(
    edit.old_string,
    actualOld,
    edit.new_string,
  )
  return { ...edit, old_string: actualOld, new_string: actualNew }
}
