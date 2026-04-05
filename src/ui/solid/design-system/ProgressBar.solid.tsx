/**
 * ProgressBar — horizontal progress indicator, SolidJS + OpenTUI port.
 *
 * Port of src/components/design-system/ProgressBar.tsx.
 */

import type { JSX } from '@opentui/solid'
import { useThemeColors } from './ThemeProvider.solid.js'

interface ProgressBarProps {
  /** Progress value between 0 and 1. */
  value: number
  /** Width in characters. Defaults to 20. */
  width?: number
  /** Theme color key for the filled portion. */
  color?: string
}

export function ProgressBar(props: ProgressBarProps) {
  const theme = useThemeColors()

  const width = () => props.width ?? 20
  const filled = () => Math.round(props.value * width())
  const empty = () => width() - filled()
  const color = () => props.color ? (theme() as any)[props.color] ?? props.color : theme().claude

  return (
    <text>
      <span fg={color()}>{'█'.repeat(filled())}</span>
      <span fg={theme().inactive}>{'░'.repeat(empty())}</span>
    </text>
  )
}
