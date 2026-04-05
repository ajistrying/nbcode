import { createSignal, onMount } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { UP_ARROW } from '../../../constants/figures.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { isOpus1mMergeEnabled } from '../../../utils/model/model.js'
import { AnimatedAsterisk } from './AnimatedAsterisk.solid.js'

const MAX_SHOW_COUNT = 6

export function shouldShowOpus1mMergeNotice(): boolean {
  return (
    isOpus1mMergeEnabled() &&
    (getGlobalConfig().opus1mMergeNoticeSeenCount ?? 0) < MAX_SHOW_COUNT
  )
}

export function Opus1mMergeNotice(): JSX.Element {
  const [show] = createSignal(shouldShowOpus1mMergeNotice)

  onMount(() => {
    if (!show()) return
    const newCount = (getGlobalConfig().opus1mMergeNoticeSeenCount ?? 0) + 1
    saveGlobalConfig(prev => {
      if ((prev.opus1mMergeNoticeSeenCount ?? 0) >= newCount) return prev
      return { ...prev, opus1mMergeNoticeSeenCount: newCount }
    })
  })

  return (
    <Show when={show()}>
      <box paddingLeft={2}>
        <AnimatedAsterisk char={UP_ARROW} />
        <text dimmed>
          {' '}Opus now defaults to 1M context · 5x more room, same pricing
        </text>
      </box>
    </Show>
  )
}
