import type { JSX } from '@opentui/solid'

export function PressEnterToContinue(): JSX.Element {
  return (
    <text fg="permission">
      Press <text><b>Enter</b></text> to continue…
    </text>
  )
}
