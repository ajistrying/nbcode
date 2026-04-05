/**
 * AlternateScreen — fullscreen terminal mode, SolidJS + OpenTUI equivalent.
 *
 * In Ink, AlternateScreen enters the terminal's alternate screen buffer and
 * enables mouse tracking. In OpenTUI, this is handled by the renderer
 * configuration — the alternate screen is the default mode.
 *
 * This component exists for API compatibility during migration. It constrains
 * its children to the terminal viewport height.
 */

import { useTerminalDimensions } from '@opentui/solid'
import type { JSX } from '@opentui/solid'

export interface AlternateScreenProps {
  children?: JSX.Element
}

export function AlternateScreen(props: AlternateScreenProps) {
  const dims = useTerminalDimensions()

  return (
    <box
      flexDirection="column"
      width={dims().width}
      height={dims().height}
    >
      {props.children}
    </box>
  )
}
