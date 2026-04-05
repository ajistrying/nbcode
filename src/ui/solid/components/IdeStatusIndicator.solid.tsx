import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { basename } from 'path'
import { useIdeConnectionStatus } from '../../../hooks/useIdeConnectionStatus.js'
import type { IDESelection } from '../../../hooks/useIdeSelection.js'
import type { MCPServerConnection } from '../../../services/mcp/types.js'

type IdeStatusIndicatorProps = {
  ideSelection: IDESelection | undefined
  mcpClients?: MCPServerConnection[]
}

export function IdeStatusIndicator(props: IdeStatusIndicatorProps): JSX.Element {
  const { status: ideStatus } = useIdeConnectionStatus(props.mcpClients)

  const shouldShowIdeSelection = () =>
    ideStatus === 'connected' &&
    (props.ideSelection?.filePath ||
      (props.ideSelection?.text && props.ideSelection.lineCount > 0))

  const showSelection = () =>
    ideStatus !== null && shouldShowIdeSelection() && props.ideSelection

  return (
    <Show when={showSelection()}>
      <Show
        when={props.ideSelection!.text && props.ideSelection!.lineCount > 0}
        fallback={
          <Show when={props.ideSelection!.filePath}>
            <text fg="ide" wrap="truncate">
              ⧉ In {basename(props.ideSelection!.filePath!)}
            </text>
          </Show>
        }
      >
        <text fg="ide" wrap="truncate">
          ⧉ {props.ideSelection!.lineCount}{' '}
          {props.ideSelection!.lineCount === 1 ? 'line' : 'lines'} selected
        </text>
      </Show>
    </Show>
  ) as JSX.Element
}
