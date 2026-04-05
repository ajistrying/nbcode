import type { JSX } from '@opentui/solid'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Tools } from '../../../../Tool.js'
import type { NormalizedUserMessage, ProgressMessage } from '../../../../types/message.js'
import { type buildMessageLookups, CANCEL_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE, REJECT_MESSAGE } from '../../../../utils/messages.js'
import { getToolUseId } from '../../../../utils/toolBlockCompat.js'
import { UserToolCanceledMessage } from './UserToolCanceledMessage.solid.js'
import { UserToolErrorMessage } from './UserToolErrorMessage.solid.js'
import { UserToolRejectMessage } from './UserToolRejectMessage.solid.js'
import { UserToolSuccessMessage } from '../../../../components/messages/UserToolResultMessage/UserToolSuccessMessage.js'
import { useGetToolFromMessages } from '../../../../components/messages/UserToolResultMessage/utils.js'

type Props = {
  param: ToolResultBlockParam
  message: NormalizedUserMessage
  lookups: ReturnType<typeof buildMessageLookups>
  progressMessagesForMessage: ProgressMessage[]
  style?: 'condensed'
  tools: Tools
  verbose: boolean
  width: number | string
  isTranscriptMode?: boolean
}

export function UserToolResultMessage(props: Props): JSX.Element {
  const toolUse = useGetToolFromMessages(getToolUseId(props.param), props.tools, props.lookups)

  if (!toolUse) return null

  if (typeof props.param.content === 'string' && props.param.content.startsWith(CANCEL_MESSAGE)) {
    return <UserToolCanceledMessage />
  }

  if (
    (typeof props.param.content === 'string' && props.param.content.startsWith(REJECT_MESSAGE)) ||
    props.param.content === INTERRUPT_MESSAGE_FOR_TOOL_USE
  ) {
    return (
      <UserToolRejectMessage
        input={toolUse.toolUse.input as { [key: string]: unknown }}
        progressMessagesForMessage={props.progressMessagesForMessage}
        tool={toolUse.tool}
        tools={props.tools}
        lookups={props.lookups}
        style={props.style}
        verbose={props.verbose}
        isTranscriptMode={props.isTranscriptMode}
      />
    )
  }

  if (props.param.is_error) {
    return (
      <UserToolErrorMessage
        progressMessagesForMessage={props.progressMessagesForMessage}
        tool={toolUse.tool}
        tools={props.tools}
        param={props.param}
        verbose={props.verbose}
        isTranscriptMode={props.isTranscriptMode}
      />
    )
  }

  return (
    <UserToolSuccessMessage
      message={props.message}
      lookups={props.lookups}
      toolUseID={toolUse.toolUse.id}
      progressMessagesForMessage={props.progressMessagesForMessage}
      style={props.style}
      tool={toolUse.tool}
      tools={props.tools}
      verbose={props.verbose}
      width={props.width}
      isTranscriptMode={props.isTranscriptMode}
    />
  )
}
