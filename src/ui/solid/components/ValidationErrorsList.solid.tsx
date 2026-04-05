import type { JSX } from '@opentui/solid'
import { For, Show } from 'solid-js'
import type { ValidationError } from '../../../utils/settings/validation.js'

type Props = {
  errors: ValidationError[]
}

export function ValidationErrorsList(props: Props): JSX.Element {
  return (
    <box flexDirection="column">
      <For each={props.errors}>{(error) => (
        <box flexDirection="column">
          <box>
            <text fg="error"><b>{error.file}</b></text>
          </box>
          <For each={error.errors}>{(err) => (
            <box marginLeft={2}>
              <text dimmed>
                {'\u2022'} {err.path ? `${err.path}: ` : ''}{err.message}
              </text>
            </box>
          )}</For>
        </box>
      )}</For>
    </box>
  )
}
