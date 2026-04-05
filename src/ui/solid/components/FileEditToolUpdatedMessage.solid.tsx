import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { relative } from 'path'
import { getCwd } from '../../../utils/cwd.js'
import { HighlightedCode } from '../../components/HighlightedCode.js'
import { MessageResponse } from './MessageResponse.solid.js'

type Props = {
  filePath: string
  content: string
  verbose: boolean
}

export function FileEditToolUpdatedMessage(props: Props): JSX.Element {
  const displayPath = () =>
    props.verbose ? props.filePath : relative(getCwd(), props.filePath)

  return (
    <MessageResponse>
      <box flexDirection="column">
        <box flexDirection="row">
          <text fg="subtle">Updated </text>
          <text fg="subtle"><b>{displayPath()}</b></text>
        </box>
        <Show when={props.content}>
          <box marginTop={1} flexDirection="column">
            <HighlightedCode
              code={props.content}
              filePath={props.filePath}
              dim
            />
          </box>
        </Show>
      </box>
    </MessageResponse>
  )
}
