/**
 * Horizontal divider line — SolidJS + OpenTUI port.
 *
 * Port of src/components/design-system/Divider.tsx.
 * Notice how much simpler this is without React Compiler memoization:
 * SolidJS only re-runs the expressions that read reactive values.
 */

import { useTerminalDimensions } from '@opentui/solid'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useThemeColors, resolveColor } from './ThemeProvider.solid.js'

interface DividerProps {
  width?: number
  color?: string
  char?: string
  padding?: number
  title?: string
}

export function Divider(props: DividerProps) {
  const dims = useTerminalDimensions()
  const theme = useThemeColors()

  const char = () => props.char ?? '─'
  const padding = () => props.padding ?? 0
  const effectiveWidth = () => Math.max(0, (props.width ?? dims().width) - padding())

  const fg = () => resolveColor(props.color, theme()) ?? theme().inactive

  return (
    <Show
      when={props.title}
      fallback={
        <text fg={fg()} dimmed={!props.color}>
          {char().repeat(effectiveWidth())}
        </text>
      }
    >
      {(title) => {
        const titleWidth = () => title().length + 2
        const sideWidth = () => Math.max(0, effectiveWidth() - titleWidth())
        const leftWidth = () => Math.floor(sideWidth() / 2)
        const rightWidth = () => sideWidth() - leftWidth()

        return (
          <text fg={fg()} dimmed={!props.color}>
            {char().repeat(leftWidth())} <span dimmed>{title()}</span> {char().repeat(rightWidth())}
          </text>
        )
      }}
    </Show>
  )
}
