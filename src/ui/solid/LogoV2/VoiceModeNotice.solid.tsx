import { createSignal, onMount } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'
import { isVoiceModeEnabled } from '../../../voice/voiceModeEnabled.js'
import { AnimatedAsterisk } from './AnimatedAsterisk.solid.js'
import { shouldShowOpus1mMergeNotice } from './Opus1mMergeNotice.solid.js'

const MAX_SHOW_COUNT = 3

function VoiceModeNoticeInner(): JSX.Element {
  const [show] = createSignal(
    () =>
      isVoiceModeEnabled() &&
      getInitialSettings().voiceEnabled !== true &&
      (getGlobalConfig().voiceNoticeSeenCount ?? 0) < MAX_SHOW_COUNT &&
      !shouldShowOpus1mMergeNotice(),
  )

  onMount(() => {
    if (!show()) return
    const newCount = (getGlobalConfig().voiceNoticeSeenCount ?? 0) + 1
    saveGlobalConfig(prev => {
      if ((prev.voiceNoticeSeenCount ?? 0) >= newCount) return prev
      return { ...prev, voiceNoticeSeenCount: newCount }
    })
  })

  return (
    <Show when={show()}>
      <box paddingLeft={2}>
        <AnimatedAsterisk />
        <text dimmed> Voice mode is now available · /voice to enable</text>
      </box>
    </Show>
  )
}

export function VoiceModeNotice(): JSX.Element {
  return feature('VOICE_MODE') ? <VoiceModeNoticeInner /> : null
}
