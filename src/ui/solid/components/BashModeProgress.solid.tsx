import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import type { ShellProgress } from '../../../types/tools.js'
import { UserBashInputMessage } from '../../components/messages/UserBashInputMessage.js'
import { ShellProgressMessage } from '../../components/shell/ShellProgressMessage.js'

type Props = {
  input: string
  progress: ShellProgress | null
  verbose: boolean
}

export function BashModeProgress(props: Props): JSX.Element {
  return (
    <box flexDirection="column" marginTop={1}>
      <UserBashInputMessage
        addMargin={false}
        param={{ text: `<bash-input>${props.input}</bash-input>`, type: 'text' }}
      />
      <Show
        when={props.progress}
        fallback={
          BashTool.renderToolUseProgressMessage?.([], {
            verbose: props.verbose,
            tools: [],
            terminalSize: undefined,
          })
        }
      >
        <ShellProgressMessage
          fullOutput={props.progress!.fullOutput}
          output={props.progress!.output}
          elapsedTimeSeconds={props.progress!.elapsedTimeSeconds}
          totalLines={props.progress!.totalLines}
          verbose={props.verbose}
        />
      </Show>
    </box>
  )
}
