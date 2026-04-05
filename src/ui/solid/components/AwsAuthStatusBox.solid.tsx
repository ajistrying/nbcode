import { createSignal, onMount, onCleanup } from 'solid-js'
import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import {
  type AwsAuthStatus,
  AwsAuthStatusManager,
} from '../../../utils/awsAuthStatusManager.js'

const URL_RE = /https?:\/\/\S+/

export function AwsAuthStatusBox(): JSX.Element {
  const [status, setStatus] = createSignal<AwsAuthStatus>(
    AwsAuthStatusManager.getInstance().getStatus(),
  )

  onMount(() => {
    const unsubscribe = AwsAuthStatusManager.getInstance().subscribe(setStatus)
    onCleanup(unsubscribe)
  })

  const shouldHide = () =>
    !status().isAuthenticating && !status().error && status().output.length === 0

  const shouldHideSuccess = () =>
    !status().isAuthenticating && !status().error

  return (
    <Show when={!shouldHide() && !shouldHideSuccess()}>
      <box
        flexDirection="column"
        borderStyle="round"
        borderColor="permission"
        paddingX={1}
        marginY={1}
      >
        <text fg="permission"><b>Cloud Authentication</b></text>

        <Show when={status().output.length > 0}>
          <box flexDirection="column" marginTop={1}>
            <For each={status().output.slice(-5)}>
              {(line, index) => {
                const m = line.match(URL_RE)
                if (!m) {
                  return <text dimmed>{line}</text>
                }
                const url = m[0]
                const start = m.index ?? 0
                const before = line.slice(0, start)
                const after = line.slice(start + url.length)
                return (
                  <text dimmed>
                    {before}{url}{after}
                  </text>
                )
              }}
            </For>
          </box>
        </Show>

        <Show when={status().error}>
          <box marginTop={1}>
            <text fg="red">{status().error}</text>
          </box>
        </Show>
      </box>
    </Show>
  )
}
