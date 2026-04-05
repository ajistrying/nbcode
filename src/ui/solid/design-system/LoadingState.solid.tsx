/**
 * A spinner with loading message for async operations.
 *
 * SolidJS + OpenTUI port of src/components/design-system/LoadingState.tsx.
 *
 * Note: The Spinner component is referenced but not ported here.
 * You will need a Solid-compatible Spinner or stub.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'

interface LoadingStateProps {
  /** The loading message to display next to the spinner. */
  message: string
  /** Display the message in bold. @default false */
  bold?: boolean
  /** Display the message in dimmed color. @default false */
  dimColor?: boolean
  /** Optional subtitle displayed below the main message. */
  subtitle?: string
}

export function LoadingState(props: LoadingStateProps) {
  const bold = () => props.bold ?? false
  const dimColor = () => props.dimColor ?? false

  // Spinner placeholder — replace with a real SolidJS spinner component
  const spinnerText = () => '⠋'

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text>{spinnerText()}</text>
        <text dimmed={dimColor()}>
          <Show when={bold()} fallback={<>{" "}{props.message}</>}>
            <b>{" "}{props.message}</b>
          </Show>
        </text>
      </box>
      <Show when={props.subtitle}>
        <text dimmed>{props.subtitle}</text>
      </Show>
    </box>
  )
}
