import type { JSX } from '@opentui/solid'
import { For, Show } from 'solid-js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import type { ThemeName } from '../../../utils/theme.js'
import { THEMES } from '../../../utils/theme.js'

type Props = {
  currentTheme: ThemeName
  onSelect: (theme: ThemeName) => void
  onCancel: () => void
}

export function ThemePicker(props: Props): JSX.Element {
  const themeOptions = () =>
    Object.entries(THEMES).map(([name, theme]) => ({
      label: (
        <box>
          <text fg={theme.primary as any}>
            {'\u25CF'} {name}
          </text>
          <Show when={name === props.currentTheme}>
            <text dimmed> (current)</text>
          </Show>
        </box>
      ),
      value: name,
    }))

  return (
    <Dialog
      title="Select Theme"
      onCancel={props.onCancel}
      color="permission"
    >
      <text>Choose a color theme for Claude Code:</text>
      <Select
        options={themeOptions()}
        defaultValue={props.currentTheme}
        onChange={(value) => props.onSelect(value as ThemeName)}
        onCancel={props.onCancel}
      />
    </Dialog>
  )
}
