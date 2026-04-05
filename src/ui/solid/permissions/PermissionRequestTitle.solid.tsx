import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { Theme } from '../../../utils/theme.js'
import type { WorkerBadgeProps } from './WorkerBadge.solid.js'

type Props = {
  title: string
  subtitle?: JSX.Element
  color?: keyof Theme
  workerBadge?: WorkerBadgeProps
}

export function PermissionRequestTitle(props: Props): JSX.Element {
  const color = () => props.color ?? 'permission'

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={color()}>
          <b>{props.title}</b>
        </text>
        <Show when={props.workerBadge}>
          <text dimmed>{'\xB7 '}@{props.workerBadge!.name}</text>
        </Show>
      </box>
      <Show when={props.subtitle != null}>
        {typeof props.subtitle === 'string' ? (
          <text dimmed wrap="truncate-start">
            {props.subtitle}
          </text>
        ) : (
          props.subtitle
        )}
      </Show>
    </box>
  )
}
