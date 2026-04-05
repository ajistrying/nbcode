/**
 * RecentDenialsTab — SolidJS port of
 * src/components/permissions/rules/RecentDenialsTab.tsx
 *
 * Displays recent auto-mode denials with toggle/retry support.
 * Each denial can be approved (checkmark toggle) or marked for retry.
 */
import { createSignal, createEffect, Show, For, type JSX } from 'solid-js'
import { type AutoModeDenial, getAutoModeDenials } from '../../../utils/autoModeDenials.js'

type RecentDenialsTabProps = {
  onHeaderFocusChange?: (focused: boolean) => void
  onStateChange: (state: {
    approved: Set<number>
    retry: Set<number>
    denials: readonly AutoModeDenial[]
  }) => void
  // Injected from parent (replaces React hook):
  headerFocused: boolean
  focusHeader: () => void
}

export function RecentDenialsTab(props: RecentDenialsTabProps): JSX.Element {
  // Notify parent when header focus changes
  createEffect(() => {
    props.onHeaderFocusChange?.(props.headerFocused)
  })

  const [denials] = createSignal<AutoModeDenial[]>(getAutoModeDenials())
  const [approved, setApproved] = createSignal<Set<number>>(new Set())
  const [retry, setRetry] = createSignal<Set<number>>(new Set())
  const [focusedIdx, setFocusedIdx] = createSignal(0)

  // Notify parent when state changes
  createEffect(() => {
    props.onStateChange({
      approved: approved(),
      retry: retry(),
      denials: denials(),
    })
  })

  function handleSelect(value: string) {
    const idx = Number(value)
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  function handleFocus(value: string) {
    setFocusedIdx(Number(value))
  }

  function handleRetry() {
    const idx = focusedIdx()
    setRetry((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
    // Also mark as approved
    setApproved((prev) => {
      if (prev.has(idx)) return prev
      const next = new Set(prev)
      next.add(idx)
      return next
    })
  }

  // Empty state
  const isEmpty = () => denials().length === 0

  return (
    <Show
      when={!isEmpty()}
      fallback={
        <text dimmed>
          No recent denials. Commands denied by the auto mode classifier will appear here.
        </text>
      }
    >
      <box flexDirection="column">
        <text>Commands recently denied by the auto mode classifier.</text>
        <box marginTop={1}>
          <box flexDirection="column">
            <For each={denials()}>
              {(d, idx) => {
                const isApproved = () => approved().has(idx())
                const isRetry = () => retry().has(idx())
                const suffix = () => (isRetry() ? ' (retry)' : '')
                return (
                  <text>
                    {isApproved() ? '\u2714 ' : '\u2718 '}
                    {d.display}
                    <text dimmed>{suffix()}</text>
                  </text>
                )
              }}
            </For>
          </box>
        </box>
      </box>
    </Show>
  )
}
