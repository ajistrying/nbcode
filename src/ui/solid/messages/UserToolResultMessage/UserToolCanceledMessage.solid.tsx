import type { JSX } from '@opentui/solid'
import { InterruptedByUser } from '../../../../components/InterruptedByUser.js'
import { MessageResponse } from '../../../../components/MessageResponse.js'

export function UserToolCanceledMessage(): JSX.Element {
  return (
    <MessageResponse height={1}>
      <InterruptedByUser />
    </MessageResponse>
  )
}
