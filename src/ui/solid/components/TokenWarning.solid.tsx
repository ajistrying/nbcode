import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { formatTokens } from '../../../utils/format.js'

type Props = {
  tokensUsed: number
  tokenLimit: number
  isAutoMode: boolean
}

export function TokenWarning(props: Props): JSX.Element {
  const percentage = () => Math.round((props.tokensUsed / props.tokenLimit) * 100)
  const isWarning = () => percentage() >= 80 && percentage() < 95
  const isCritical = () => percentage() >= 95

  return (
    <Show when={isWarning() || isCritical()}>
      <box marginTop={1}>
        <text fg={isCritical() ? 'error' : 'warning'}>
          <b>{isCritical() ? 'Critical' : 'Warning'}:</b>{' '}
          Context window usage is at {percentage()}% ({formatTokens(props.tokensUsed)}/{formatTokens(props.tokenLimit)} tokens).
          <Show when={isCritical()}>
            {' '}Consider starting a new conversation with /clear.
          </Show>
        </text>
      </box>
    </Show>
  ) as JSX.Element
}
