import type { JSX } from '@opentui/solid'
import BashToolResultMessage from '../../../tools/BashTool/BashToolResultMessage.js'
import { extractTag } from '../../../utils/messages.js'

type Props = {
  content: string
  verbose?: boolean
}

export function UserBashOutputMessage(props: Props): JSX.Element {
  const rawStdout = () => extractTag(props.content, 'bash-stdout') ?? ''
  const stdout = () => extractTag(rawStdout(), 'persisted-output') ?? rawStdout()
  const stderr = () => extractTag(props.content, 'bash-stderr') ?? ''

  return <BashToolResultMessage content={{ stdout: stdout(), stderr: stderr() }} verbose={!!props.verbose} />
}
