import type { JSX } from '@opentui/solid'
import chalk from 'chalk'
import { Show } from 'solid-js'
import { LIGHTNING_BOLT } from '../../../constants/figures.js'
import { getGlobalConfig } from '../../../utils/config.js'
import { resolveThemeSetting } from '../../../utils/systemTheme.js'
import { color } from '../../components/design-system/color.js'

type Props = {
  cooldown?: boolean
}

export function FastIcon(props: Props): JSX.Element {
  return (
    <Show
      when={!props.cooldown}
      fallback={
        <text fg="promptBorder" dimmed>{LIGHTNING_BOLT}</text>
      }
    >
      <text fg="fastMode">{LIGHTNING_BOLT}</text>
    </Show>
  ) as JSX.Element
}

export function getFastIconString(applyColor = true, cooldown = false): string {
  if (!applyColor) {
    return LIGHTNING_BOLT
  }
  const themeName = resolveThemeSetting(getGlobalConfig().theme)
  if (cooldown) {
    return chalk.dim(color('promptBorder', themeName)(LIGHTNING_BOLT))
  }
  return color('fastMode', themeName)(LIGHTNING_BOLT)
}
