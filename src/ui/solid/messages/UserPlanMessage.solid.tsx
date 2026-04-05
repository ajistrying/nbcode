import type { JSX } from '@opentui/solid'
import { Markdown } from '../../../components/Markdown.js'

type Props = {
  addMargin: boolean
  planContent: string
}

export function UserPlanMessage(props: Props): JSX.Element {
  return (
    <box flexDirection="column" borderStyle="round" borderColor="planMode" marginTop={props.addMargin ? 1 : 0} paddingX={1}>
      <box marginBottom={1}>
        <text fg="planMode"><b>Plan to implement</b></text>
      </box>
      <Markdown>{props.planContent}</Markdown>
    </box>
  )
}
