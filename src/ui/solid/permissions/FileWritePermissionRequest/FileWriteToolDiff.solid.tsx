import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useTerminalSize } from '../../../../hooks/useTerminalSize.js'
import { intersperse } from '../../../../utils/array.js'
import { getPatchForDisplay } from '../../../../utils/diff.js'
import { HighlightedCode } from '../../../../components/HighlightedCode.js'
import { StructuredDiff } from '../../../../components/StructuredDiff.js'

type Props = {
  file_path: string
  content: string
  fileExists: boolean
  oldContent: string
}

/**
 * No stateful hooks (useMemo only -> computed at creation).
 */
export function FileWriteToolDiff(props: Props): JSX.Element {
  const { columns } = useTerminalSize()

  const hunks = () => {
    if (!props.fileExists) return null
    return getPatchForDisplay({
      filePath: props.file_path,
      fileContents: props.oldContent,
      edits: [
        {
          old_string: props.oldContent,
          new_string: props.content,
          replace_all: false,
        },
      ],
    })
  }

  const firstLine = () => props.content.split('\n')[0] ?? null

  return (
    <box flexDirection="column">
      <box
        borderColor="subtle"
        borderStyle="dashed"
        flexDirection="column"
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Show
          when={hunks()}
          fallback={
            <HighlightedCode code={props.content || '(No content)'} filePath={props.file_path} />
          }
        >
          {intersperse(
            hunks()!.map((h) => (
              <StructuredDiff
                key={h.newStart}
                patch={h}
                dim={false}
                filePath={props.file_path}
                firstLine={firstLine()}
                fileContent={props.oldContent}
                width={columns - 2}
              />
            )),
            (i) => (
              <text dimmed key={`ellipsis-${i}`}>
                ...
              </text>
            ),
          )}
        </Show>
      </box>
    </box>
  )
}
