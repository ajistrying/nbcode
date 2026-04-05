/**
 * Clawd mascot character with multiple poses.
 *
 * SolidJS + OpenTUI port of src/components/LogoV2/Clawd.tsx.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { env } from '../../../utils/env.js'

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right'

interface ClawdProps {
  pose?: ClawdPose
}

// Standard-terminal pose fragments. Each row is split into segments so we can
// vary only the parts that change (eyes, arms) while keeping the body/bg spans
// stable. All poses end up 9 cols wide.
type Segments = {
  r1L: string
  r1E: string
  r1R: string
  r2L: string
  r2R: string
}

const POSES: Record<ClawdPose, Segments> = {
  default: { r1L: ' \u2590', r1E: '\u259B\u2588\u2588\u2588\u259C', r1R: '\u258C', r2L: '\u259D\u259C', r2R: '\u259B\u2598' },
  'look-left': { r1L: ' \u2590', r1E: '\u259F\u2588\u2588\u2588\u259F', r1R: '\u258C', r2L: '\u259D\u259C', r2R: '\u259B\u2598' },
  'look-right': { r1L: ' \u2590', r1E: '\u2599\u2588\u2588\u2588\u2599', r1R: '\u258C', r2L: '\u259D\u259C', r2R: '\u259B\u2598' },
  'arms-up': { r1L: '\u2597\u259F', r1E: '\u259B\u2588\u2588\u2588\u259C', r1R: '\u2599\u2596', r2L: ' \u259C', r2R: '\u259B ' },
}

const APPLE_EYES: Record<ClawdPose, string> = {
  default: ' \u2597   \u2596 ',
  'look-left': ' \u2598   \u2598 ',
  'look-right': ' \u259D   \u259D ',
  'arms-up': ' \u2597   \u2596 ',
}

export function Clawd(props: ClawdProps = {}) {
  const pose = () => props.pose ?? 'default'

  return (
    <Show
      when={env.terminal !== 'Apple_Terminal'}
      fallback={<AppleTerminalClawd pose={pose()} />}
    >
      {(() => {
        const p = () => POSES[pose()]
        return (
          <box flexDirection="column">
            <text>
              <text fg="clawd_body">{p().r1L}</text>
              <text fg="clawd_body" bg="clawd_background">{p().r1E}</text>
              <text fg="clawd_body">{p().r1R}</text>
            </text>
            <text>
              <text fg="clawd_body">{p().r2L}</text>
              <text fg="clawd_body" bg="clawd_background">{'\u2588\u2588\u2588\u2588\u2588'}</text>
              <text fg="clawd_body">{p().r2R}</text>
            </text>
            <text fg="clawd_body">{'  '}{'\u2598\u2598 \u259D\u259D'}{'  '}</text>
          </box>
        )
      })()}
    </Show>
  )
}

function AppleTerminalClawd(props: { pose: ClawdPose }) {
  const eyes = () => APPLE_EYES[props.pose]

  return (
    <box flexDirection="column" alignItems="center">
      <text>
        <text fg="clawd_body">{'\u2597'}</text>
        <text fg="clawd_background" bg="clawd_body">{eyes()}</text>
        <text fg="clawd_body">{'\u2596'}</text>
      </text>
      <text bg="clawd_body">{' '.repeat(7)}</text>
      <text fg="clawd_body">{'\u2598\u2598 \u259D\u259D'}</text>
    </box>
  )
}
