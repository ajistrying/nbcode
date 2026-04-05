import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { useAppState } from '../../../state/AppState.js'
import { getViewedTeammateTask } from '../../../state/selectors.js'
import { toInkColor } from '../../../utils/ink.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { OffscreenFreeze } from '../../components/OffscreenFreeze.js'

/**
 * Header shown when viewing a teammate's transcript.
 * Displays teammate name (colored), task description, and exit hint.
 */
export function TeammateViewHeader(): JSX.Element {
  const viewedTeammate = useAppState(s => getViewedTeammateTask(s))

  return (
    <Show when={viewedTeammate}>
      <OffscreenFreeze>
        <box flexDirection="column" marginBottom={1}>
          <box>
            <text>Viewing </text>
            <text fg={toInkColor(viewedTeammate!.identity.color)}>
              <b>@{viewedTeammate!.identity.agentName}</b>
            </text>
            <text dimmed>
              {' \u00B7 '}
              <KeyboardShortcutHint shortcut="esc" action="return" />
            </text>
          </box>
          <text dimmed>{viewedTeammate!.prompt}</text>
        </box>
      </OffscreenFreeze>
    </Show>
  ) as JSX.Element
}
