import { createSignal, onMount, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import figures from 'figures'
import { SentryErrorBoundary } from 'src/components/SentryErrorBoundary.js'
import { useAppState } from '../../../../state/AppState.js'
import { filterToolProgressMessages, type Tool, type Tools } from '../../../../Tool.js'
import type { NormalizedUserMessage, ProgressMessage } from '../../../../types/message.js'
import {
  deleteClassifierApproval,
  getClassifierApproval,
  getYoloClassifierApproval,
} from '../../../../utils/classifierApprovals.js'
import type { buildMessageLookups } from '../../../../utils/messages.js'
import { MessageResponse } from '../../../../components/MessageResponse.js'
import { HookProgressMessage } from '../HookProgressMessage.solid.js'

type Props = {
  message: NormalizedUserMessage
  lookups: ReturnType<typeof buildMessageLookups>
  toolUseID: string
  progressMessagesForMessage: ProgressMessage[]
  style?: 'condensed'
  tool?: Tool
  tools: Tools
  verbose: boolean
  width: number | string
  isTranscriptMode?: boolean
}

export function UserToolSuccessMessage(props: Props): JSX.Element {
  // NOTE: >3 hooks (useState x2, useEffect x1, useTheme x1, plus feature-gated useAppState)

  const isBriefOnly =
    feature('KAIROS') || feature('KAIROS_BRIEF')
      ? useAppState((s) => s.isBriefOnly)
      : false

  // Capture classifier approval once on mount, then delete from Map to prevent linear growth.
  // createSignal with lazy initializer ensures the value persists across re-renders.
  const [classifierRule] = createSignal(getClassifierApproval(props.toolUseID))
  const [yoloReason] = createSignal(getYoloClassifierApproval(props.toolUseID))

  onMount(() => {
    deleteClassifierApproval(props.toolUseID)
  })

  if (!props.message.toolUseResult || !props.tool) {
    return null
  }

  // Validate against outputSchema before rendering
  const parsedOutput = props.tool.outputSchema?.safeParse(props.message.toolUseResult)
  if (parsedOutput && !parsedOutput.success) {
    return null
  }
  const toolResult = parsedOutput?.data ?? props.message.toolUseResult

  const renderedMessage =
    props.tool.renderToolResultMessage?.(
      toolResult as never,
      filterToolProgressMessages(props.progressMessagesForMessage),
      {
        style: props.style,
        tools: props.tools,
        verbose: props.verbose,
        isTranscriptMode: props.isTranscriptMode,
        isBriefOnly,
        input: props.lookups.toolUseByToolUseID.get(props.toolUseID)?.input,
      },
    ) ?? null

  if (renderedMessage === null) {
    return null
  }

  const rendersAsAssistantText = props.tool.userFacingName(undefined) === ''

  return (
    <box flexDirection="column">
      <box flexDirection="column" width={rendersAsAssistantText ? undefined : props.width}>
        {renderedMessage}
        <Show when={feature('BASH_CLASSIFIER') && classifierRule()}>
          <MessageResponse height={1}>
            <text dimmed>
              <text fg="success">{figures.tick}</text>
              {' Auto-approved \u00b7 matched '}
              {`"${classifierRule()}"`}
            </text>
          </MessageResponse>
        </Show>
        <Show when={feature('TRANSCRIPT_CLASSIFIER') && yoloReason()}>
          <MessageResponse height={1}>
            <text dimmed>Allowed by auto mode classifier</text>
          </MessageResponse>
        </Show>
      </box>
      <SentryErrorBoundary>
        <HookProgressMessage
          hookEvent="PostToolUse"
          lookups={props.lookups}
          toolUseID={props.toolUseID}
          verbose={props.verbose}
          isTranscriptMode={props.isTranscriptMode}
        />
      </SentryErrorBoundary>
    </box>
  )
}
