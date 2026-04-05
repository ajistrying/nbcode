/**
 * A pane -- a region of the terminal that appears below the REPL prompt,
 * bounded by a colored top line with a one-row gap above and horizontal
 * padding.
 *
 * SolidJS + OpenTUI port of src/components/design-system/Pane.tsx.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { Divider } from './Divider.solid.js'

interface PaneProps {
  children: JSX.Element
  /** Theme color for the top border line. */
  color?: string
  /** If true, render as inside-modal variant (no divider, less padding). */
  insideModal?: boolean
}

export function Pane(props: PaneProps) {
  return (
    <Show
      when={!props.insideModal}
      fallback={
        <box flexDirection="column" paddingX={1} flexShrink={0}>
          {props.children}
        </box>
      }
    >
      <box flexDirection="column" paddingTop={1}>
        <Divider color={props.color} />
        <box flexDirection="column" paddingX={2}>
          {props.children}
        </box>
      </box>
    </Show>
  )
}
