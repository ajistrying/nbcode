import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { ThinkingBlock, ThinkingBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { Markdown } from '../../../components/Markdown.js'

type Props = {
  param: ThinkingBlock | ThinkingBlockParam | { type: 'thinking'; thinking: string }
  addMargin: boolean
  isTranscriptMode: boolean
  verbose: boolean
  hideInTranscript?: boolean
}

export function AssistantThinkingMessage(props: Props): JSX.Element {
  const thinking = () => props.param.thinking
  const addMargin = () => props.addMargin ?? false
  const hideInTranscript = () => props.hideInTranscript ?? false

  if (!thinking()) {
    return null
  }
  if (hideInTranscript()) {
    return null
  }

  const shouldShowFullThinking = () => props.isTranscriptMode || props.verbose

  return (
    <Show when={shouldShowFullThinking()} fallback={
      <box marginTop={addMargin() ? 1 : 0}>
        <text dimmed><i>{"∴ Thinking"} <CtrlOToExpand /></i></text>
      </box>
    }>
      <box flexDirection="column" gap={1} marginTop={addMargin() ? 1 : 0} width="100%">
        <text dimmed><i>{"∴ Thinking"}…</i></text>
        <box paddingLeft={2}>
          <Markdown dimColor={true}>{thinking()}</Markdown>
        </box>
      </box>
    </Show>
  )
}
