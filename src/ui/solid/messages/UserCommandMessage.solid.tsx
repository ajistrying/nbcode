import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import figures from 'figures'
import { COMMAND_MESSAGE_TAG } from '../../../constants/xml.js'
import { extractTag } from '../../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserCommandMessage(props: Props): JSX.Element {
  const text = () => props.param.text
  const commandMessage = () => extractTag(text(), COMMAND_MESSAGE_TAG)
  const args = () => extractTag(text(), 'command-args')
  const isSkillFormat = () => extractTag(text(), 'skill-format') === 'true'

  if (!commandMessage()) {
    return null
  }

  if (isSkillFormat()) {
    return (
      <box flexDirection="column" marginTop={props.addMargin ? 1 : 0} bg="userMessageBackground" paddingRight={1}>
        <text>
          <text fg="subtle">{figures.pointer} </text>
          <text fg="text">Skill({commandMessage()})</text>
        </text>
      </box>
    )
  }

  const content = () => `/${[commandMessage(), args()].filter(Boolean).join(' ')}`

  return (
    <box flexDirection="column" marginTop={props.addMargin ? 1 : 0} bg="userMessageBackground" paddingRight={1}>
      <text>
        <text fg="subtle">{figures.pointer} </text>
        <text fg="text">{content()}</text>
      </text>
    </box>
  )
}
