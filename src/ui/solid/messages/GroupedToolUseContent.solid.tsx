import type { JSX } from '@opentui/solid'
import type { ToolResultBlockParam, ToolUseBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs'
import { filterToolProgressMessages, findToolByName, type Tools } from '../../../Tool.js'
import type { GroupedToolUseMessage } from '../../../types/message.js'
import type { buildMessageLookups } from '../../../utils/messages.js'
import { isToolResultBlock, getToolUseId, getToolCallId } from '../../../utils/toolBlockCompat.js'

type Props = {
  message: GroupedToolUseMessage
  tools: Tools
  lookups: ReturnType<typeof buildMessageLookups>
  inProgressToolUseIDs: Set<string>
  shouldAnimate: boolean
}

export function GroupedToolUseContent(props: Props): JSX.Element {
  const tool = findToolByName(props.tools, props.message.toolName)
  if (!tool?.renderGroupedToolUse) {
    return null
  }

  const resultsByToolUseId = new Map<string, { param: ToolResultBlockParam; output: unknown }>()
  for (const resultMsg of props.message.results) {
    for (const content of resultMsg.message.content) {
      if (isToolResultBlock(content)) {
        resultsByToolUseId.set(getToolUseId(content), {
          param: content,
          output: resultMsg.toolUseResult,
        })
      }
    }
  }

  const toolUsesData = props.message.messages.map(msg => {
    const content = msg.message.content[0]
    const result = resultsByToolUseId.get(content.id)
    return {
      param: content as ToolUseBlockParam,
      isResolved: props.lookups.resolvedToolUseIDs.has(content.id),
      isError: props.lookups.erroredToolUseIDs.has(content.id),
      isInProgress: props.inProgressToolUseIDs.has(content.id),
      progressMessages: filterToolProgressMessages(
        props.lookups.progressMessagesByToolUseID.get(content.id) ?? [],
      ),
      result,
    }
  })

  const anyInProgress = toolUsesData.some(d => d.isInProgress)
  return tool.renderGroupedToolUse(toolUsesData, {
    shouldAnimate: props.shouldAnimate && anyInProgress,
    tools: props.tools,
  })
}
