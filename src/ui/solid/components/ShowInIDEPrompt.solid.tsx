import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'

type Props = {
  filePath: string
  lineNumber?: number
  onYes: () => void
  onNo: () => void
}

export function ShowInIDEPrompt(props: Props): JSX.Element {
  return (
    <box flexDirection="column">
      <text>
        Open <text><b>{props.filePath}</b></text>
        <Show when={props.lineNumber}>
          <text> at line {props.lineNumber}</text>
        </Show>
        {' '}in your IDE?
      </text>
    </box>
  )
}
