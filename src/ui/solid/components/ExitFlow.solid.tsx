import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import sample from 'lodash-es/sample.js'
import { gracefulShutdown } from '../../../utils/gracefulShutdown.js'
import { WorktreeExitDialog } from '../../components/WorktreeExitDialog.js'

const GOODBYE_MESSAGES = ['Goodbye!', 'See ya!', 'Bye!', 'Catch you later!']

function getRandomGoodbyeMessage(): string {
  return sample(GOODBYE_MESSAGES) ?? 'Goodbye!'
}

type Props = {
  onDone: (message?: string) => void
  onCancel?: () => void
  showWorktree: boolean
}

export function ExitFlow(props: Props): JSX.Element {
  async function onExit(resultMessage?: string) {
    props.onDone(resultMessage ?? getRandomGoodbyeMessage())
    await gracefulShutdown(0, 'prompt_input_exit')
  }

  return (
    <Show when={props.showWorktree} fallback={null}>
      <WorktreeExitDialog onDone={onExit} onCancel={props.onCancel} />
    </Show>
  ) as JSX.Element
}
