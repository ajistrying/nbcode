import { Show, For, type JSXElement } from 'solid-js'
import type { RemoteAgentTaskState } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { DeepImmutable } from '../../../types/utils.js'
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../../constants/figures.js'
import { useSettings } from '../../../hooks/useSettings.js'
import { useAnimationFrame } from '../../../ink.js'
import { count } from '../../../utils/array.js'
import { getRainbowColor } from '../../../utils/thinking.js'

const TICK_MS = 80

type ReviewStage = NonNullable<
  NonNullable<RemoteAgentTaskState['reviewProgress']>['stage']
>

export function formatReviewStageCounts(
  stage: ReviewStage | undefined,
  found: number,
  verified: number,
  refuted: number,
): string {
  if (!stage) return `${found} found · ${verified} verified`
  if (stage === 'synthesizing') {
    const parts = [`${verified} verified`]
    if (refuted > 0) parts.push(`${refuted} refuted`)
    parts.push('deduping')
    return parts.join(' · ')
  }
  if (stage === 'verifying') {
    const parts = [`${found} found`, `${verified} verified`]
    if (refuted > 0) parts.push(`${refuted} refuted`)
    return parts.join(' · ')
  }
  return found > 0 ? `${found} found` : 'finding'
}

function RainbowText(props: { text: string; phase?: number }): JSXElement {
  return (
    <>
      <For each={[...props.text]}>
        {(ch, i) => (
          <text fg={getRainbowColor(i() + (props.phase ?? 0))}>{ch}</text>
        )}
      </For>
    </>
  )
}

function useSmoothCount(
  target: number,
  time: number,
  snap: boolean,
): number {
  let displayed = target
  let lastTick = time
  if (snap || target < displayed) {
    displayed = target
  } else if (target > displayed && time !== lastTick) {
    displayed += 1
    lastTick = time
  }
  return displayed
}

function ReviewRainbowLine(props: {
  session: DeepImmutable<RemoteAgentTaskState>
}): JSXElement {
  const settings = useSettings()
  const reducedMotion = () => settings.prefersReducedMotion ?? false
  const p = () => props.session.reviewProgress
  const running = () => props.session.status === 'running'

  const [, time] = useAnimationFrame(
    running() && !reducedMotion() ? TICK_MS : null,
  )

  const targetFound = () => p()?.bugsFound ?? 0
  const targetVerified = () => p()?.bugsVerified ?? 0
  const targetRefuted = () => p()?.bugsRefuted ?? 0
  const snap = () => reducedMotion() || !running()

  const found = () => useSmoothCount(targetFound(), time(), snap())
  const verified = () => useSmoothCount(targetVerified(), time(), snap())
  const refuted = () => useSmoothCount(targetRefuted(), time(), snap())

  const phase = () => Math.floor(time() / (TICK_MS * 3)) % 7

  return (
    <Show
      when={props.session.status !== 'completed' && props.session.status !== 'failed'}
      fallback={
        <Show
          when={props.session.status === 'completed'}
          fallback={
            <>
              <text fg="background">{DIAMOND_FILLED} </text>
              <RainbowText text="ultrareview" phase={0} />
              <text fg="error" dimmed>
                {' · '}error
              </text>
            </>
          }
        >
          <>
            <text fg="background">{DIAMOND_FILLED} </text>
            <RainbowText text="ultrareview" phase={0} />
            <text dimmed> ready · shift+↓ to view</text>
          </>
        </Show>
      }
    >
      <>
        <text fg="background">{DIAMOND_OPEN} </text>
        <RainbowText text="ultrareview" phase={running() ? phase() : 0} />
        <text dimmed>
          {' · '}
          {!p()
            ? 'setting up'
            : formatReviewStageCounts(
                p()!.stage,
                found(),
                verified(),
                refuted(),
              )}
        </text>
      </>
    </Show>
  )
}

export function RemoteSessionProgress(props: {
  session: DeepImmutable<RemoteAgentTaskState>
}): JSXElement {
  if (props.session.isRemoteReview) {
    return <ReviewRainbowLine session={props.session} />
  }

  if (props.session.status === 'completed') {
    return (
      <text bold fg="success" dimmed>
        done
      </text>
    )
  }

  if (props.session.status === 'failed') {
    return (
      <text bold fg="error" dimmed>
        error
      </text>
    )
  }

  if (!props.session.todoList.length) {
    return <text dimmed>{props.session.status}…</text>
  }

  const completed = () =>
    count(props.session.todoList, (_) => _.status === 'completed')
  const total = () => props.session.todoList.length

  return (
    <text dimmed>
      {completed()}/{total()}
    </text>
  )
}
