import { createSignal, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { formatAPIError } from 'src/services/api/errorUtils.js'
import type { SystemAPIErrorMessage as SystemAPIErrorMessageType } from 'src/types/message.js'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

const MAX_API_ERROR_CHARS = 1000

type Props = {
  message: SystemAPIErrorMessageType
  verbose: boolean
}

export function SystemAPIErrorMessage(props: Props): JSX.Element {
  const retryAttempt = () => props.message.retryAttempt
  const error = () => props.message.error
  const retryInMs = () => props.message.retryInMs
  const maxRetries = () => props.message.maxRetries

  // Hidden for early retries on external builds to avoid noise.
  const hidden = () => true && retryAttempt() < 4

  const [countdownMs, setCountdownMs] = createSignal(0)
  const done = () => countdownMs() >= retryInMs()

  // useInterval equivalent: use setInterval manually
  let intervalId: ReturnType<typeof setInterval> | null = null

  // NOTE: SolidJS createEffect would auto-track, but for a timer we use a simple approach
  // We start the interval on mount if not hidden
  if (!hidden()) {
    intervalId = setInterval(() => {
      if (done() || hidden()) {
        if (intervalId) clearInterval(intervalId)
        return
      }
      setCountdownMs((ms) => ms + 1000)
    }, 1000)
  }

  if (hidden()) return null

  const retryInSecondsLive = () => Math.max(0, Math.round((retryInMs() - countdownMs()) / 1000))

  const formatted = () => formatAPIError(error())
  const truncated = () => !props.verbose && formatted().length > MAX_API_ERROR_CHARS

  return (
    <MessageResponse>
      <box flexDirection="column">
        <text fg="error">
          {truncated() ? formatted().slice(0, MAX_API_ERROR_CHARS) + '\u2026' : formatted()}
        </text>
        <Show when={truncated()}>
          <CtrlOToExpand />
        </Show>
        <text dimmed>
          Retrying in {retryInSecondsLive()}{' '}
          {retryInSecondsLive() === 1 ? 'second' : 'seconds'}\u2026 (attempt{' '}
          {retryAttempt()}/{maxRetries()})
          {process.env.API_TIMEOUT_MS
            ? ` \u00b7 API_TIMEOUT_MS=${process.env.API_TIMEOUT_MS}ms, try increasing it`
            : ''}
        </text>
      </box>
    </MessageResponse>
  )
}
