import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getInitialSettings } from '../../../utils/settings/settings.js'
import { Clawd, type ClawdPose } from './Clawd.js'

type Frame = { pose: ClawdPose; offset: number }

function hold(pose: ClawdPose, offset: number, frames: number): Frame[] {
  return Array.from({ length: frames }, () => ({ pose, offset }))
}

const JUMP_WAVE: readonly Frame[] = [
  ...hold('default', 1, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 1),
  ...hold('default', 1, 2),
  ...hold('arms-up', 0, 3),
  ...hold('default', 0, 1),
]

const LOOK_AROUND: readonly Frame[] = [
  ...hold('look-right', 0, 5),
  ...hold('look-left', 0, 5),
  ...hold('default', 0, 1),
]

const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [JUMP_WAVE, LOOK_AROUND]

const IDLE: Frame = { pose: 'default', offset: 0 }
const FRAME_MS = 60
const CLAWD_HEIGHT = 3

function useClawdAnimation(): {
  pose: () => ClawdPose
  bounceOffset: () => number
  onClick: () => void
} {
  const [reducedMotion] = createSignal(
    () => getInitialSettings().prefersReducedMotion ?? false,
  )
  const [frameIndex, setFrameIndex] = createSignal(-1)
  let sequenceRef: readonly Frame[] = JUMP_WAVE

  const onClick = () => {
    if (reducedMotion() || frameIndex() !== -1) return
    sequenceRef =
      CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!
    setFrameIndex(0)
  }

  createEffect(() => {
    const fi = frameIndex()
    if (fi === -1) return
    if (fi >= sequenceRef.length) {
      setFrameIndex(-1)
      return
    }
    const timer = setTimeout(() => setFrameIndex(prev => prev + 1), FRAME_MS)
    onCleanup(() => clearTimeout(timer))
  })

  const current = () => {
    const fi = frameIndex()
    const seq = sequenceRef
    return fi >= 0 && fi < seq.length ? seq[fi]! : IDLE
  }

  return {
    pose: () => current().pose,
    bounceOffset: () => current().offset,
    onClick,
  }
}

export function AnimatedClawd(): JSX.Element {
  const { pose, bounceOffset, onClick } = useClawdAnimation()
  return (
    <box height={CLAWD_HEIGHT} flexDirection="column" onClick={onClick}>
      <box marginTop={bounceOffset()} flexShrink={0}>
        <Clawd pose={pose()} />
      </box>
    </box>
  )
}
