/**
 * StatusIcon — visual status indicator, SolidJS + OpenTUI port.
 *
 * Port of src/components/design-system/StatusIcon.tsx.
 */

import { Switch, Match } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useThemeColors } from './ThemeProvider.solid.js'

type Status = 'success' | 'error' | 'warning' | 'info' | 'pending' | 'running'

interface StatusIconProps {
  status: Status
}

const STATUS_CHARS: Record<Status, string> = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '●',
}

export function StatusIcon(props: StatusIconProps) {
  const theme = useThemeColors()

  const color = () => {
    switch (props.status) {
      case 'success': return theme().success
      case 'error': return theme().error
      case 'warning': return theme().warning
      case 'info': return theme().suggestion
      case 'pending': return theme().inactive
      case 'running': return theme().claude
    }
  }

  return (
    <text fg={color()}>
      {STATUS_CHARS[props.status]}
    </text>
  )
}
