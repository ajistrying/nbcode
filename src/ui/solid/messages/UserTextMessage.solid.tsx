import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { NO_CONTENT_MESSAGE } from '../../../constants/messages.js'
import { COMMAND_MESSAGE_TAG, LOCAL_COMMAND_CAVEAT_TAG, TASK_NOTIFICATION_TAG, TEAMMATE_MESSAGE_TAG, TICK_TAG } from '../../../constants/xml.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { extractTag, INTERRUPT_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE } from '../../../utils/messages.js'
import { InterruptedByUser } from '../../../components/InterruptedByUser.js'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { UserAgentNotificationMessage } from './UserAgentNotificationMessage.solid.js'
import { UserBashInputMessage } from './UserBashInputMessage.solid.js'
import { UserBashOutputMessage } from './UserBashOutputMessage.solid.js'
import { UserCommandMessage } from './UserCommandMessage.solid.js'
import { UserLocalCommandOutputMessage } from './UserLocalCommandOutputMessage.solid.js'
import { UserMemoryInputMessage } from '../../../components/messages/UserMemoryInputMessage.js'
import { UserPlanMessage } from './UserPlanMessage.solid.js'
import { UserPromptMessage } from '../../../components/messages/UserPromptMessage.js'
import { UserResourceUpdateMessage } from './UserResourceUpdateMessage.solid.js'
import { UserTeammateMessage } from './UserTeammateMessage.solid.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
  verbose: boolean
  planContent?: string
  isTranscriptMode?: boolean
  timestamp?: string
}

export function UserTextMessage(props: Props): JSX.Element {
  const text = () => props.param.text

  if (text().trim() === NO_CONTENT_MESSAGE) return null

  if (props.planContent) {
    return <UserPlanMessage addMargin={props.addMargin} planContent={props.planContent} />
  }

  if (extractTag(text(), TICK_TAG)) return null
  if (text().includes(`<${LOCAL_COMMAND_CAVEAT_TAG}>`)) return null

  if (text().startsWith('<bash-stdout') || text().startsWith('<bash-stderr')) {
    return <UserBashOutputMessage content={text()} verbose={props.verbose} />
  }

  if (text().startsWith('<local-command-stdout') || text().startsWith('<local-command-stderr')) {
    return <UserLocalCommandOutputMessage content={text()} />
  }

  if (text() === INTERRUPT_MESSAGE || text() === INTERRUPT_MESSAGE_FOR_TOOL_USE) {
    return <MessageResponse height={1}><InterruptedByUser /></MessageResponse>
  }

  if (text().includes('<bash-input>')) {
    return <UserBashInputMessage addMargin={props.addMargin} param={props.param} />
  }

  if (text().includes(`<${COMMAND_MESSAGE_TAG}>`)) {
    return <UserCommandMessage addMargin={props.addMargin} param={props.param} />
  }

  if (text().includes('<user-memory-input>')) {
    return <UserMemoryInputMessage addMargin={props.addMargin} text={text()} />
  }

  if (isAgentSwarmsEnabled() && text().includes(`<${TEAMMATE_MESSAGE_TAG}`)) {
    return <UserTeammateMessage addMargin={props.addMargin} param={props.param} isTranscriptMode={props.isTranscriptMode} />
  }

  if (text().includes(`<${TASK_NOTIFICATION_TAG}`)) {
    return <UserAgentNotificationMessage addMargin={props.addMargin} param={props.param} />
  }

  if (text().includes('<mcp-resource-update') || text().includes('<mcp-polling-update')) {
    return <UserResourceUpdateMessage addMargin={props.addMargin} param={props.param} />
  }

  // Default: render as prompt message
  return <UserPromptMessage addMargin={props.addMargin} param={props.param} verbose={props.verbose} timestamp={props.timestamp} />
}
