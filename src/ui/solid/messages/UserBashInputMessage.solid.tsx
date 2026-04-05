import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { extractTag } from '../../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserBashInputMessage(props: Props): JSX.Element {
  const input = () => extractTag(props.param.text, 'bash-input')

  if (!input()) {
    return null
  }

  return (
    <box flexDirection="row" marginTop={props.addMargin ? 1 : 0} bg="bashMessageBackgroundColor" paddingRight={1}>
      <text fg="bashBorder">! </text>
      <text fg="text">{input()}</text>
    </box>
  )
}
