/**
 * Help screen (V2) with tabbed navigation.
 *
 * SolidJS + OpenTUI port of src/components/HelpV2/HelpV2.tsx.
 *
 * Note: This component uses several hooks from the React codebase
 * (useExitOnCtrlCDWithKeybindings, useKeybinding, useShortcutDisplay,
 *  useTerminalSize, useIsInsideModal) and components (Tabs, Tab, Commands,
 *  Link, Pane). These are referenced but would need Solid equivalents.
 * The presentational layout is fully ported.
 */

import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import {
  builtInCommandNames,
  type Command,
  type CommandResultDisplay,
} from '../../../commands.js'
import { Pane } from '../design-system/Pane.solid.js'
import { General } from './General.solid.js'

interface HelpV2Props {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  commands: Command[]
  /** Terminal rows for sizing. */
  rows?: number
  /** Terminal columns for sizing. */
  columns?: number
  /** Whether rendered inside a modal slot. */
  insideModal?: boolean
  /** The exit state for ctrl+c/d display. */
  exitState?: { pending: boolean; keyName: string }
  /** The dismiss shortcut text. */
  dismissShortcut?: string
}

export function HelpV2(props: HelpV2Props) {
  const rows = () => props.rows ?? 24
  const columns = () => props.columns ?? 80
  const maxHeight = () => Math.floor(rows() / 2)
  const insideModal = () => props.insideModal ?? false
  const exitState = () => props.exitState ?? { pending: false, keyName: 'ctrl+c' }
  const dismissShortcut = () => props.dismissShortcut ?? 'esc'

  const close = () =>
    props.onClose('Help dialog dismissed', { display: 'system' })

  const builtinNames = () => builtInCommandNames()

  const builtinCommands = () =>
    props.commands.filter(
      (cmd) => builtinNames().has(cmd.name) && !cmd.isHidden,
    )

  const customCommands = () =>
    props.commands.filter(
      (cmd) => !builtinNames().has(cmd.name) && !cmd.isHidden,
    )

  const height = () => (insideModal() ? undefined : maxHeight())

  return (
    <box flexDirection="column" height={height()}>
      <Pane color="professionalBlue">
        {/* Tabs would go here -- using a simplified layout until Tabs is ported */}
        <box flexDirection="column">
          <text fg="professionalBlue">
            <b>{`Noble Base Code v${MACRO.VERSION}`}</b>
          </text>

          {/* General tab content */}
          <General />

          {/* Commands info placeholder */}
          <Show when={builtinCommands().length > 0}>
            <box flexDirection="column" marginTop={1}>
              <text><b>Commands</b></text>
              <text dimmed>
                {builtinCommands().length} built-in commands,{' '}
                {customCommands().length} custom commands
              </text>
            </box>
          </Show>
        </box>

        <box marginTop={1}>
          <text>
            For more help:{' '}
            <text fg="blue"><u>https://code.claude.com/docs/en/overview</u></text>
          </text>
        </box>

        <box marginTop={1}>
          <text dimmed>
            <Show
              when={!exitState().pending}
              fallback={<>Press {exitState().keyName} again to exit</>}
            >
              <i>{dismissShortcut()} to cancel</i>
            </Show>
          </text>
        </box>
      </Pane>
    </box>
  )
}
