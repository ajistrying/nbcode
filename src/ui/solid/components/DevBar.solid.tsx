import { createSignal } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getSlowOperations } from '../../../bootstrap/state.js'

function shouldShowDevBar(): boolean {
  return 'production' === 'development' || 'external' === 'ant'
}

export function DevBar(): JSX.Element {
  const [slowOps, setSlowOps] = createSignal(getSlowOperations())

  // useInterval equivalent: poll with setInterval
  if (shouldShowDevBar()) {
    setInterval(() => {
      setSlowOps(getSlowOperations())
    }, 500)
  }

  const recentOps = () =>
    slowOps()
      .slice(-3)
      .map(
        (op: { operation: string; durationMs: number }) =>
          `${op.operation} (${Math.round(op.durationMs)}ms)`,
      )
      .join(' \u00B7 ')

  return (
    <Show when={shouldShowDevBar() && slowOps().length > 0}>
      <text wrap="truncate-end" fg="yellow">
        [ANT-ONLY] slow sync: {recentOps()}
      </text>
    </Show>
  )
}
