import type { JSX } from '@opentui/solid'
import type { StructuredPatchHunk } from 'diff'
import { For, Show } from 'solid-js'

type Props = {
  patch: StructuredPatchHunk
  dim: boolean
  width: number
  filePath: string
  firstLine: string | null
  fileContent?: string
}

export function StructuredDiff(props: Props): JSX.Element {
  return (
    <box flexDirection="column">
      <For each={props.patch.lines}>{(line) => {
        const prefix = line.charAt(0)
        const content = line.slice(1)
        const isAdd = prefix === '+'
        const isRemove = prefix === '-'

        return (
          <box>
            <Show when={isAdd}>
              <text fg="success" dimmed={props.dim}>
                {prefix}{content}
              </text>
            </Show>
            <Show when={isRemove}>
              <text fg="error" dimmed={props.dim}>
                {prefix}{content}
              </text>
            </Show>
            <Show when={!isAdd && !isRemove}>
              <text dimmed={props.dim}>
                {prefix}{content}
              </text>
            </Show>
          </box>
        )
      }}</For>
    </box>
  )
}
