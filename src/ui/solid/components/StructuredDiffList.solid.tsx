import type { StructuredPatchHunk } from 'diff'
import type { JSX } from '@opentui/solid'
import { For } from 'solid-js'
import { intersperse } from '../../../utils/array.js'
import { StructuredDiff } from '../../components/StructuredDiff.js'

type Props = {
  hunks: StructuredPatchHunk[]
  dim: boolean
  width: number
  filePath: string
  firstLine: string | null
  fileContent?: string
}

/** Renders a list of diff hunks with ellipsis separators between them. */
export function StructuredDiffList(props: Props): JSX.Element {
  return (
    <>
      {intersperse(
        props.hunks.map(hunk => (
          <box flexDirection="column">
            <StructuredDiff
              patch={hunk}
              dim={props.dim}
              width={props.width}
              filePath={props.filePath}
              firstLine={props.firstLine}
              fileContent={props.fileContent}
            />
          </box>
        )),
        (i) => (
          <box>
            <text dimmed>...</text>
          </box>
        ),
      )}
    </>
  ) as JSX.Element
}
