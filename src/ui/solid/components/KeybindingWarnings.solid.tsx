import type { JSX } from '@opentui/solid'
import { Show, For } from 'solid-js'
import {
  getCachedKeybindingWarnings,
  getKeybindingsPath,
  isKeybindingCustomizationEnabled,
} from '../../../keybindings/loadUserBindings.js'

/**
 * Displays keybinding validation warnings in the UI.
 */
export function KeybindingWarnings(): JSX.Element {
  if (!isKeybindingCustomizationEnabled()) {
    return null as unknown as JSX.Element
  }

  const warnings = getCachedKeybindingWarnings()
  if (warnings.length === 0) {
    return null as unknown as JSX.Element
  }

  const errors = warnings.filter(w => w.severity === 'error')
  const warns = warnings.filter(w => w.severity === 'warning')

  return (
    <box flexDirection="column" marginTop={1} marginBottom={1}>
      <text fg={errors.length > 0 ? 'error' : 'warning'}>
        <b>Keybinding Configuration Issues</b>
      </text>
      <box>
        <text dimmed>Location: </text>
        <text dimmed>{getKeybindingsPath()}</text>
      </box>
      <box marginLeft={1} flexDirection="column" marginTop={1}>
        <For each={errors}>{(error, i) => (
          <box flexDirection="column">
            <box>
              <text dimmed>{'\u2514'} </text>
              <text fg="error">[Error]</text>
              <text dimmed> {error.message}</text>
            </box>
            <Show when={error.suggestion}>
              <box marginLeft={3}>
                <text dimmed>{'\u2192'} {error.suggestion}</text>
              </box>
            </Show>
          </box>
        )}</For>
        <For each={warns}>{(warning, i) => (
          <box flexDirection="column">
            <box>
              <text dimmed>{'\u2514'} </text>
              <text fg="warning">[Warning]</text>
              <text dimmed> {warning.message}</text>
            </box>
            <Show when={warning.suggestion}>
              <box marginLeft={3}>
                <text dimmed>{'\u2192'} {warning.suggestion}</text>
              </box>
            </Show>
          </box>
        )}</For>
      </box>
    </box>
  )
}
