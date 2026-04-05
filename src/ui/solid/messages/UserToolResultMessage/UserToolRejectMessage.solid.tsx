import type { JSX } from '@opentui/solid'
import { useTerminalSize } from '../../../../hooks/useTerminalSize.js'
import { useTheme } from '../../../../ink.js'
import { filterToolProgressMessages, type Tool, type Tools } from '../../../../Tool.js'
import type { ProgressMessage } from '../../../../types/message.js'
import type { buildMessageLookups } from '../../../../utils/messages.js'
import { FallbackToolUseRejectedMessage } from '../../../../components/FallbackToolUseRejectedMessage.js'

type Props = {
  input: { [key: string]: unknown }
  progressMessagesForMessage: ProgressMessage[]
  style?: 'condensed'
  tool?: Tool
  tools: Tools
  lookups: ReturnType<typeof buildMessageLookups>
  verbose: boolean
  isTranscriptMode?: boolean
}

export function UserToolRejectMessage(props: Props): JSX.Element {
  const { columns } = useTerminalSize()
  const [theme] = useTheme()

  if (!props.tool || !props.tool.renderToolUseRejectedMessage) {
    return <FallbackToolUseRejectedMessage />
  }

  const parsedInput = props.tool.inputSchema.safeParse(props.input)
  if (!parsedInput.success) {
    return <FallbackToolUseRejectedMessage />
  }

  return (
    props.tool.renderToolUseRejectedMessage(parsedInput.data, {
      columns,
      messages: [],
      tools: props.tools,
      verbose: props.verbose,
      progressMessagesForMessage: filterToolProgressMessages(props.progressMessagesForMessage),
      style: props.style,
      theme,
      isTranscriptMode: props.isTranscriptMode,
    }) ?? <FallbackToolUseRejectedMessage />
  )
}
