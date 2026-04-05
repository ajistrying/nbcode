import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { BULLET_OPERATOR } from '../../../../constants/figures.js'
import { filterToolProgressMessages, type Tool, type Tools } from '../../../../Tool.js'
import type { ProgressMessage } from '../../../../types/message.js'
import { INTERRUPT_MESSAGE_FOR_TOOL_USE, isClassifierDenial, PLAN_REJECTION_PREFIX, REJECT_MESSAGE_WITH_REASON_PREFIX } from '../../../../utils/messages.js'
import { FallbackToolUseErrorMessage } from '../../../../components/FallbackToolUseErrorMessage.js'
import { InterruptedByUser } from '../../../../components/InterruptedByUser.js'
import { MessageResponse } from '../../../../components/MessageResponse.js'
import { RejectedPlanMessage } from './RejectedPlanMessage.solid.js'
import { RejectedToolUseMessage } from './RejectedToolUseMessage.solid.js'

type Props = {
  progressMessagesForMessage: ProgressMessage[]
  tool?: Tool
  tools: Tools
  param: ToolResultBlockParam
  verbose: boolean
  isTranscriptMode?: boolean
}

export function UserToolErrorMessage(props: Props): JSX.Element {
  if (typeof props.param.content === 'string' && props.param.content.includes(INTERRUPT_MESSAGE_FOR_TOOL_USE)) {
    return <MessageResponse height={1}><InterruptedByUser /></MessageResponse>
  }

  if (typeof props.param.content === 'string' && props.param.content.startsWith(PLAN_REJECTION_PREFIX)) {
    const planContent = props.param.content.substring(PLAN_REJECTION_PREFIX.length)
    return <RejectedPlanMessage plan={planContent} />
  }

  if (typeof props.param.content === 'string' && props.param.content.startsWith(REJECT_MESSAGE_WITH_REASON_PREFIX)) {
    return <RejectedToolUseMessage />
  }

  if (feature('TRANSCRIPT_CLASSIFIER') && typeof props.param.content === 'string' && isClassifierDenial(props.param.content)) {
    return (
      <MessageResponse height={1}>
        <text dimmed>Denied by auto mode classifier {BULLET_OPERATOR} /feedback if incorrect</text>
      </MessageResponse>
    )
  }

  return (
    props.tool?.renderToolUseErrorMessage?.(props.param.content, {
      progressMessagesForMessage: filterToolProgressMessages(props.progressMessagesForMessage),
      tools: props.tools,
      verbose: props.verbose,
      isTranscriptMode: props.isTranscriptMode,
    }) ?? <FallbackToolUseErrorMessage result={props.param.content} verbose={props.verbose} />
  )
}
