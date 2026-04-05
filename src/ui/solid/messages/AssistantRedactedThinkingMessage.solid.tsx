import type { JSX } from '@opentui/solid'

type Props = {
  addMargin: boolean
}

export function AssistantRedactedThinkingMessage(props: Props): JSX.Element {
  const addMargin = props.addMargin ?? false
  return (
    <box marginTop={addMargin ? 1 : 0}>
      <text dimmed><i>{"✻ Thinking…"}</i></text>
    </box>
  )
}
