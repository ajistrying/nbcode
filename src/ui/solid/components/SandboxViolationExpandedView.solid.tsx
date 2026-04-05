import { createSignal, onMount, onCleanup, Show, For, type JSXElement } from 'solid-js'
import type { SandboxViolationEvent } from '../../../utils/sandbox/sandbox-adapter.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { getPlatform } from '../../../utils/platform.js'

/**
 * Format a timestamp as "h:mm:ssa" (e.g., "1:30:45pm").
 */
function formatTime(date: Date): string {
  const h = date.getHours() % 12 || 12
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ampm = date.getHours() < 12 ? 'am' : 'pm'
  return `${h}:${m}:${s}${ampm}`
}

export function SandboxViolationExpandedView(): JSXElement {
  const [violations, setViolations] = createSignal<SandboxViolationEvent[]>([])
  const [totalCount, setTotalCount] = createSignal(0)

  onMount(() => {
    const store = SandboxManager.getSandboxViolationStore()
    const unsubscribe = store.subscribe(
      (allViolations: SandboxViolationEvent[]) => {
        setViolations(allViolations.slice(-10))
        setTotalCount(store.getTotalCount())
      },
    )

    onCleanup(unsubscribe)
  })

  return (
    <Show
      when={
        SandboxManager.isSandboxingEnabled() &&
        getPlatform() !== 'linux' &&
        totalCount() > 0
      }
    >
      <box flexDirection="column" marginTop={1}>
        <box marginLeft={0}>
          <text fg="permission">
            ⧈ Sandbox blocked {totalCount()} total{' '}
            {totalCount() === 1 ? 'operation' : 'operations'}
          </text>
        </box>
        <For each={violations()}>
          {(v, i) => (
            <box paddingLeft={2}>
              <text dimmed>
                {formatTime(v.timestamp)}
                {v.command ? ` ${v.command}:` : ''} {v.line}
              </text>
            </box>
          )}
        </For>
        <box paddingLeft={2}>
          <text dimmed>
            … showing last {Math.min(10, violations().length)} of {totalCount()}
          </text>
        </box>
      </box>
    </Show>
  )
}
