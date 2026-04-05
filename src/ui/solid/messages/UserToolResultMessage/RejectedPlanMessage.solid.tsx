import type { JSX } from '@opentui/solid'
import { Markdown } from '../../../../components/Markdown.js'
import { MessageResponse } from '../../../../components/MessageResponse.js'

type Props = {
  plan: string
}

export function RejectedPlanMessage(props: Props): JSX.Element {
  return (
    <MessageResponse>
      <box flexDirection="column">
        <text fg="subtle">User rejected Claude&apos;s plan:</text>
        <box borderStyle="round" borderColor="planMode" paddingX={1} overflow="hidden">
          <Markdown>{props.plan}</Markdown>
        </box>
      </box>
    </MessageResponse>
  )
}
