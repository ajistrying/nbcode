/**
 * Dialog component with title, subtitle, children content, and input guide.
 *
 * SolidJS + OpenTUI port of src/components/design-system/Dialog.tsx.
 *
 * Note: The original uses React hooks (useExitOnCtrlCDWithKeybindings,
 * useKeybinding, ConfigurableShortcutHint). These are kept as references
 * but would need Solid equivalents. The presentational layout is fully ported.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { Byline } from './Byline.solid.js'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.solid.js'
import { Pane } from './Pane.solid.js'

interface DialogProps {
  title: JSX.Element
  subtitle?: JSX.Element
  children: JSX.Element
  onCancel: () => void
  color?: string
  hideInputGuide?: boolean
  hideBorder?: boolean
  /** Custom input guide content. */
  inputGuide?: () => JSX.Element
  isCancelActive?: boolean
}

export function Dialog(props: DialogProps) {
  const color = () => props.color ?? 'permission'

  const defaultInputGuide = () => (
    <Byline>
      <KeyboardShortcutHint shortcut="Enter" action="confirm" />
      <KeyboardShortcutHint shortcut="Esc" action="cancel" />
    </Byline>
  )

  const content = () => (
    <>
      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text fg={color()}>
            <b>{props.title}</b>
          </text>
          <Show when={props.subtitle}>
            <text dimmed>{props.subtitle}</text>
          </Show>
        </box>
        {props.children}
      </box>
      <Show when={!props.hideInputGuide}>
        <box marginTop={1}>
          <text dimmed>
            <i>
              {props.inputGuide ? props.inputGuide() : defaultInputGuide()}
            </i>
          </text>
        </box>
      </Show>
    </>
  )

  return (
    <Show when={!props.hideBorder} fallback={content()}>
      <Pane color={color()}>{content()}</Pane>
    </Show>
  )
}
