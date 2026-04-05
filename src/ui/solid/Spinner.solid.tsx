/**
 * Proof-of-concept: Spinner component rendered via OpenTUI + SolidJS.
 *
 * This is a leaf component with no React dependencies — it validates that
 * the dual-JSX build pipeline works and OpenTUI renders correctly.
 */

import { createSignal, onCleanup } from 'solid-js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL_MS = 80

interface SpinnerProps {
  label?: string
  color?: string
}

export function Spinner(props: SpinnerProps) {
  const [frameIndex, setFrameIndex] = createSignal(0)

  const interval = setInterval(() => {
    setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
  }, SPINNER_INTERVAL_MS)

  onCleanup(() => clearInterval(interval))

  return (
    <text>
      <span fg={props.color ?? '#5af78e'}>{SPINNER_FRAMES[frameIndex()]}</span>
      {props.label ? <span> {props.label}</span> : null}
    </text>
  )
}
