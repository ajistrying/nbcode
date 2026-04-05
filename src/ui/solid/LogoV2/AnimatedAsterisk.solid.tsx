import { createSignal, createEffect, onCleanup } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { TEARDROP_ASTERISK } from '../../../constants/figures.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'
import { hueToRgb, toRGBColor } from '../../Spinner/utils.js'

const SWEEP_DURATION_MS = 1500
const SWEEP_COUNT = 2
const TOTAL_ANIMATION_MS = SWEEP_DURATION_MS * SWEEP_COUNT
const SETTLED_GREY = toRGBColor({ r: 153, g: 153, b: 153 })

export function AnimatedAsterisk(props: { char?: string }): JSX.Element {
  const char = () => props.char ?? TEARDROP_ASTERISK

  const [reducedMotion] = createSignal(
    () => getInitialSettings().prefersReducedMotion ?? false,
  )
  const [done, setDone] = createSignal(reducedMotion())
  let startTime: number | null = null
  const [time, setTime] = createSignal(0)

  createEffect(() => {
    if (done()) return
    const t = setTimeout(() => setDone(true), TOTAL_ANIMATION_MS)
    onCleanup(() => clearTimeout(t))
  })

  createEffect(() => {
    if (done()) return
    const id = setInterval(() => setTime(Date.now()), 50)
    onCleanup(() => clearInterval(id))
  })

  return (
    <Show
      when={!done()}
      fallback={
        <box>
          <text fg={SETTLED_GREY}>{char()}</text>
        </box>
      }
    >
      {(() => {
        const now = time()
        if (startTime === null) {
          startTime = now
        }
        const elapsed = now - startTime
        const hue = ((elapsed / SWEEP_DURATION_MS) * 360) % 360
        return (
          <box>
            <text fg={toRGBColor(hueToRgb(hue))}>{char()}</text>
          </box>
        )
      })()}
    </Show>
  )
}
