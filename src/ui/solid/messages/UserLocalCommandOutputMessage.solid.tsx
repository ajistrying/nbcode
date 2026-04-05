import type { JSX } from '@opentui/solid'
import { extractTag } from '../../../utils/messages.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

type Props = {
  content: string
}

export function UserLocalCommandOutputMessage(props: Props): JSX.Element {
  const stdout = () => extractTag(props.content, 'local-command-stdout') ?? ''
  const stderr = () => extractTag(props.content, 'local-command-stderr') ?? ''
  const output = () => [stdout(), stderr()].filter(Boolean).join('\n')

  if (!output()) {
    return null
  }

  return (
    <MessageResponse>
      <text dimmed>{output()}</text>
    </MessageResponse>
  )
}
