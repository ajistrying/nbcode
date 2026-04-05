import { createSignal, onMount, onCleanup, Show, type JSXElement } from 'solid-js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'

export function SandboxPromptFooterHint(): JSXElement {
  const [recentViolationCount, setRecentViolationCount] = createSignal(0)
  let timerRef: ReturnType<typeof setTimeout> | null = null
  const detailsShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )

  onMount(() => {
    if (!SandboxManager.isSandboxingEnabled()) {
      return
    }

    const store = SandboxManager.getSandboxViolationStore()
    let lastCount = store.getTotalCount()

    const unsubscribe = store.subscribe(() => {
      const currentCount = store.getTotalCount()
      const newViolations = currentCount - lastCount

      if (newViolations > 0) {
        setRecentViolationCount(newViolations)
        lastCount = currentCount

        if (timerRef) {
          clearTimeout(timerRef)
        }

        timerRef = setTimeout(setRecentViolationCount, 5000, 0)
      }
    })

    onCleanup(() => {
      unsubscribe()
      if (timerRef) {
        clearTimeout(timerRef)
      }
    })
  })

  return (
    <Show
      when={
        SandboxManager.isSandboxingEnabled() && recentViolationCount() !== 0
      }
    >
      <box paddingX={0} paddingY={0}>
        <text fg="inactive" wrap="truncate">
          ⧈ Sandbox blocked {recentViolationCount()}{' '}
          {recentViolationCount() === 1 ? 'operation' : 'operations'} ·{' '}
          {detailsShortcut} for details · /sandbox to disable
        </text>
      </box>
    </Show>
  )
}
