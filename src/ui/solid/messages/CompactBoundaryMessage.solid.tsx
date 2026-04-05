import type { JSX } from '@opentui/solid'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'

export function CompactBoundaryMessage(): JSX.Element {
  const historyShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o')
  return (
    <box marginY={1}>
      <text dimmed>{"✻ Conversation compacted ("}{historyShortcut}{" for history)"}</text>
    </box>
  )
}
