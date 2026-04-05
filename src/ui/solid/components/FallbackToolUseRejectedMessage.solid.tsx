import type { JSX } from '@opentui/solid'
import { InterruptedByUser } from './InterruptedByUser.solid.js'
import { MessageResponse } from '../../components/MessageResponse.js'

export function FallbackToolUseRejectedMessage(): JSX.Element {
  return (
    <MessageResponse height={1}>
      <InterruptedByUser />
    </MessageResponse>
  )
}
