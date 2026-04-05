import type { JSX } from '@opentui/solid'
import { MessageResponse } from '../../../../components/MessageResponse.js'

export function RejectedToolUseMessage(): JSX.Element {
  return (
    <MessageResponse height={1}>
      <text dimmed>Tool use rejected</text>
    </MessageResponse>
  )
}
