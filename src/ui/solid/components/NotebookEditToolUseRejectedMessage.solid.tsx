import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { relative } from 'path'
import { getCwd } from 'src/utils/cwd.js'
import { HighlightedCode } from '../../components/HighlightedCode.js'
import { MessageResponse } from './MessageResponse.solid.js'

type Props = {
  notebook_path: string
  cell_id: string | undefined
  new_source: string
  cell_type?: 'code' | 'markdown'
  edit_mode?: 'replace' | 'insert' | 'delete'
  verbose: boolean
}

export function NotebookEditToolUseRejectedMessage(props: Props): JSX.Element {
  const edit_mode = () => props.edit_mode ?? 'replace'
  const operation = () => edit_mode() === 'delete' ? 'delete' : `${edit_mode()} cell in`
  const displayPath = () =>
    props.verbose ? props.notebook_path : relative(getCwd(), props.notebook_path)

  return (
    <MessageResponse>
      <box flexDirection="column">
        <box flexDirection="row">
          <text fg="subtle">User rejected {operation()} </text>
          <text fg="subtle"><b>{displayPath()}</b></text>
          <text fg="subtle"> at cell {props.cell_id}</text>
        </box>
        <Show when={edit_mode() !== 'delete'}>
          <box marginTop={1} flexDirection="column">
            <HighlightedCode
              code={props.new_source}
              filePath={props.cell_type === 'markdown' ? 'file.md' : 'file.py'}
              dim
            />
          </box>
        </Show>
      </box>
    </MessageResponse>
  )
}
