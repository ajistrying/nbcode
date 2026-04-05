import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { extractTag } from '../../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'killed': return 'warning'
    default: return 'text'
  }
}

export function UserAgentNotificationMessage(props: Props): JSX.Element {
  const text = () => props.param.text
  const summary = () => extractTag(text(), 'summary')

  if (!summary()) {
    return null
  }

  const color = () => {
    const status = extractTag(text(), 'status')
    return getStatusColor(status)
  }

  return (
    <box marginTop={props.addMargin ? 1 : 0}>
      <text><text fg={color()}>{BLACK_CIRCLE}</text> {summary()}</text>
    </box>
  )
}
