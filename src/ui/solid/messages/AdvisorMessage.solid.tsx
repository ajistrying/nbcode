import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import type { AdvisorBlock } from '../../../utils/advisor.js'
import { renderModelName } from '../../../utils/model/model.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { ToolUseLoader } from '../../../components/ToolUseLoader.js'

type Props = {
  block: AdvisorBlock
  addMargin: boolean
  resolvedToolUseIDs: Set<string>
  erroredToolUseIDs: Set<string>
  shouldAnimate: boolean
  verbose: boolean
  advisorModel?: string
}

export function AdvisorMessage(props: Props): JSX.Element {
  if (props.block.type === 'server_tool_use') {
    const input = () =>
      props.block.input && Object.keys(props.block.input).length > 0
        ? jsonStringify(props.block.input)
        : null
    return (
      <box marginTop={props.addMargin ? 1 : 0} paddingRight={2} flexDirection="row">
        <ToolUseLoader
          shouldAnimate={props.shouldAnimate}
          isUnresolved={!props.resolvedToolUseIDs.has(props.block.id)}
          isError={props.erroredToolUseIDs.has(props.block.id)}
        />
        <text><b>Advising</b></text>
        <Show when={props.advisorModel}>
          <text dimmed> using {renderModelName(props.advisorModel!)}</text>
        </Show>
        <Show when={input()}>
          <text dimmed> {"\u00b7"} {input()}</text>
        </Show>
      </box>
    )
  }

  let body: JSX.Element
  switch (props.block.content.type) {
    case 'advisor_tool_result_error':
      body = <text fg="error">Advisor unavailable ({props.block.content.error_code})</text>
      break
    case 'advisor_result':
      body = props.verbose
        ? <text dimmed>{props.block.content.text}</text>
        : <text dimmed>{figures.tick} Advisor has reviewed the conversation and will apply the feedback <CtrlOToExpand /></text>
      break
    case 'advisor_redacted_result':
      body = <text dimmed>{figures.tick} Advisor has reviewed the conversation and will apply the feedback</text>
      break
  }

  return (
    <box paddingRight={2}>
      <MessageResponse>{body}</MessageResponse>
    </box>
  )
}
