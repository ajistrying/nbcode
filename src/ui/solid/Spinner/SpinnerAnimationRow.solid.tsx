import { createMemo, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import { stringWidth } from '../../../ink/stringWidth.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import { formatDuration, formatNumber } from '../../../utils/format.js'
import { toInkColor } from '../../../utils/ink.js'
import type { Theme } from '../../../utils/theme.js'
import { Byline } from '../../solid/design-system/Byline.js'
import { GlimmerMessage } from './GlimmerMessage.js'
import { SpinnerGlyph } from './SpinnerGlyph.js'
import type { SpinnerMode } from './types.js'
import { useStalledAnimation } from './useStalledAnimation.js'
import { interpolateColor, toRGBColor } from './utils.js'
import { useAnimationFrame } from '../../../ink.js'

const SEP_WIDTH = stringWidth(' · ')
const THINKING_BARE_WIDTH = stringWidth('thinking')
const SHOW_TOKENS_AFTER_MS = 30_000

const THINKING_INACTIVE = { r: 153, g: 153, b: 153 }
const THINKING_INACTIVE_SHIMMER = { r: 185, g: 185, b: 185 }
const THINKING_DELAY_MS = 3000
const THINKING_GLOW_PERIOD_S = 2

export type SpinnerAnimationRowProps = {
  mode: SpinnerMode
  reducedMotion: boolean
  hasActiveTools: boolean
  responseLengthRef: { current: number }
  message: string
  messageColor: keyof Theme
  shimmerColor: keyof Theme
  overrideColor?: keyof Theme | null
  loadingStartTimeRef: { current: number }
  totalPausedMsRef: { current: number }
  pauseStartTimeRef: { current: number | null }
  spinnerSuffix?: string | null
  verbose: boolean
  columns: number
  hasRunningTeammates: boolean
  teammateTokens: number
  foregroundedTeammate: InProcessTeammateTaskState | undefined
  leaderIsIdle?: boolean
  thinkingStatus: 'thinking' | number | null
  effortSuffix: string
}

export function SpinnerAnimationRow(props: SpinnerAnimationRowProps): JSXElement {
  const leaderIsIdle = () => props.leaderIsIdle ?? false
  const [viewportRef, time] = useAnimationFrame(
    props.reducedMotion ? null : 50,
  )

  const now = Date.now()
  const elapsedTimeMs = () =>
    props.pauseStartTimeRef.current !== null
      ? props.pauseStartTimeRef.current -
        props.loadingStartTimeRef.current -
        props.totalPausedMsRef.current
      : Date.now() -
        props.loadingStartTimeRef.current -
        props.totalPausedMsRef.current

  const derivedStart = () => Date.now() - elapsedTimeMs()
  let turnStartCurrent = derivedStart()
  if (!props.hasRunningTeammates || derivedStart() < turnStartCurrent) {
    turnStartCurrent = derivedStart()
  }

  const currentResponseLength = () => props.responseLengthRef.current

  const stalledResult = useStalledAnimation(
    time,
    currentResponseLength(),
    props.hasActiveTools || leaderIsIdle(),
    props.reducedMotion,
  )
  const isStalled = () => stalledResult.isStalled
  const stalledIntensity = () => stalledResult.stalledIntensity

  const frame = () => (props.reducedMotion ? 0 : Math.floor(time() / 120))

  const glimmerSpeed = () => (props.mode === 'requesting' ? 50 : 200)
  const glimmerMessageWidth = createMemo(() => stringWidth(props.message))
  const cycleLength = () => glimmerMessageWidth() + 20
  const cyclePosition = () => Math.floor(time() / glimmerSpeed())
  const glimmerIndex = () =>
    props.reducedMotion
      ? -100
      : isStalled()
        ? -100
        : props.mode === 'requesting'
          ? (cyclePosition() % cycleLength()) - 10
          : glimmerMessageWidth() + 10 - (cyclePosition() % cycleLength())

  const flashOpacity = () =>
    props.reducedMotion
      ? 0
      : props.mode === 'tool-use'
        ? (Math.sin((time() / 1000) * Math.PI) + 1) / 2
        : 0

  let tokenCounterCurrent = currentResponseLength()
  if (props.reducedMotion) {
    tokenCounterCurrent = currentResponseLength()
  } else {
    const gap = currentResponseLength() - tokenCounterCurrent
    if (gap > 0) {
      let increment: number
      if (gap < 70) increment = 3
      else if (gap < 200) increment = Math.max(8, Math.ceil(gap * 0.15))
      else increment = 50
      tokenCounterCurrent = Math.min(
        tokenCounterCurrent + increment,
        currentResponseLength(),
      )
    }
  }

  const displayedResponseLength = () => tokenCounterCurrent
  const leaderTokens = () => Math.round(displayedResponseLength() / 4)

  const effectiveElapsedMs = () =>
    props.hasRunningTeammates
      ? Math.max(elapsedTimeMs(), Date.now() - turnStartCurrent)
      : elapsedTimeMs()
  const timerText = () => formatDuration(effectiveElapsedMs())
  const timerWidth = () => stringWidth(timerText())

  const totalTokens = () =>
    props.foregroundedTeammate && !props.foregroundedTeammate.isIdle
      ? (props.foregroundedTeammate.progress?.tokenCount ?? 0)
      : leaderTokens() + props.teammateTokens
  const tokenCount = () => formatNumber(totalTokens())
  const tokensText = () =>
    props.hasRunningTeammates
      ? `${tokenCount()} tokens`
      : `${figures.arrowDown} ${tokenCount()} tokens`
  const tokensWidth = () => stringWidth(tokensText())

  const thinkingText = () => {
    if (props.thinkingStatus === 'thinking') return `thinking${props.effortSuffix}`
    if (typeof props.thinkingStatus === 'number')
      return `thought for ${Math.max(1, Math.round(props.thinkingStatus / 1000))}s`
    return null
  }
  const thinkingWidthValue = () =>
    thinkingText() ? stringWidth(thinkingText()!) : 0

  const messageWidth = () => glimmerMessageWidth() + 2
  const sep = SEP_WIDTH

  const wantsThinking = () => props.thinkingStatus !== null
  const wantsTimerAndTokens = () =>
    props.verbose ||
    props.hasRunningTeammates ||
    effectiveElapsedMs() > SHOW_TOKENS_AFTER_MS

  const availableSpace = () => props.columns - messageWidth() - 5

  const showThinking = () => {
    if (wantsThinking() && availableSpace() > thinkingWidthValue()) return true
    if (
      wantsThinking() &&
      props.thinkingStatus === 'thinking' &&
      props.effortSuffix &&
      availableSpace() > THINKING_BARE_WIDTH
    )
      return true
    return false
  }

  const usedAfterThinking = () =>
    showThinking() ? thinkingWidthValue() + sep : 0
  const showTimer = () =>
    wantsTimerAndTokens() &&
    availableSpace() > usedAfterThinking() + timerWidth()
  const usedAfterTimer = () =>
    usedAfterThinking() + (showTimer() ? timerWidth() + sep : 0)
  const showTokens = () =>
    wantsTimerAndTokens() &&
    totalTokens() > 0 &&
    availableSpace() > usedAfterTimer() + tokensWidth()

  const thinkingOnly = () =>
    showThinking() &&
    props.thinkingStatus === 'thinking' &&
    !props.spinnerSuffix &&
    !showTimer() &&
    !showTokens()

  const thinkingElapsedSec = () => (time() - THINKING_DELAY_MS) / 1000
  const thinkingOpacity = () =>
    time() < THINKING_DELAY_MS
      ? 0
      : (Math.sin(
          (thinkingElapsedSec() * Math.PI * 2) / THINKING_GLOW_PERIOD_S,
        ) +
          1) /
        2
  const thinkingShimmerColor = () =>
    toRGBColor(
      interpolateColor(
        THINKING_INACTIVE,
        THINKING_INACTIVE_SHIMMER,
        thinkingOpacity(),
      ),
    )

  return (
    <box
      ref={viewportRef}
      flexDirection="row"
      flexWrap="wrap"
      marginTop={1}
      width="100%"
    >
      <SpinnerGlyph
        frame={frame()}
        messageColor={props.messageColor}
        stalledIntensity={props.overrideColor ? 0 : stalledIntensity()}
        reducedMotion={props.reducedMotion}
        time={time()}
      />
      <GlimmerMessage
        message={props.message}
        mode={props.mode}
        messageColor={props.messageColor}
        glimmerIndex={glimmerIndex()}
        flashOpacity={flashOpacity()}
        shimmerColor={props.shimmerColor}
        stalledIntensity={props.overrideColor ? 0 : stalledIntensity()}
      />
      <Show
        when={
          props.foregroundedTeammate && !props.foregroundedTeammate.isIdle
        }
        fallback={
          <Show when={!props.foregroundedTeammate && (showThinking() || showTimer() || showTokens() || props.spinnerSuffix)}>
            <Show
              when={thinkingOnly()}
              fallback={
                <>
                  <text dimmed>(</text>
                  <Byline>
                    <Show when={props.spinnerSuffix}>
                      <text dimmed>{props.spinnerSuffix}</text>
                    </Show>
                    <Show when={showTimer()}>
                      <text dimmed>{timerText()}</text>
                    </Show>
                    <Show when={showTokens()}>
                      <box flexDirection="row">
                        <text dimmed>{tokenCount()} tokens</text>
                      </box>
                    </Show>
                    <Show when={showThinking() && thinkingText()}>
                      <text
                        fg={
                          props.thinkingStatus === 'thinking' &&
                          !props.reducedMotion
                            ? thinkingShimmerColor()
                            : undefined
                        }
                        dimmed={
                          !(
                            props.thinkingStatus === 'thinking' &&
                            !props.reducedMotion
                          )
                        }
                      >
                        {thinkingText()}
                      </text>
                    </Show>
                  </Byline>
                  <text dimmed>)</text>
                </>
              }
            >
              <Byline>
                <text
                  fg={
                    props.thinkingStatus === 'thinking' &&
                    !props.reducedMotion
                      ? thinkingShimmerColor()
                      : undefined
                  }
                  dimmed={
                    !(
                      props.thinkingStatus === 'thinking' &&
                      !props.reducedMotion
                    )
                  }
                >
                  ({thinkingText()})
                </text>
              </Byline>
            </Show>
          </Show>
        }
      >
        <>
          <text dimmed>(esc to interrupt </text>
          <text
            fg={toInkColor(props.foregroundedTeammate!.identity.color)}
          >
            {props.foregroundedTeammate!.identity.agentName}
          </text>
          <text dimmed>)</text>
        </>
      </Show>
    </box>
  )
}
