import { createEffect } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'

const CONFIG_NAME = 'tengu-top-of-feed-tip'

type TipOfFeed = {
  tip: string
  color?: 'dim' | 'warning' | 'error'
}

const DEFAULT_TIP: TipOfFeed = { tip: '', color: 'dim' }

function getTipOfFeed(): TipOfFeed {
  return getDynamicConfig_CACHED_MAY_BE_STALE<TipOfFeed>(CONFIG_NAME, DEFAULT_TIP)
}

export function EmergencyTip(): JSX.Element {
  const tip = getTipOfFeed()
  const lastShownTip = getGlobalConfig().lastShownEmergencyTip

  const shouldShow = tip.tip && tip.tip !== lastShownTip

  createEffect(() => {
    if (shouldShow) {
      saveGlobalConfig(current => {
        if (current.lastShownEmergencyTip === tip.tip) return current
        return { ...current, lastShownEmergencyTip: tip.tip }
      })
    }
  })

  return (
    <Show when={shouldShow}>
      <box paddingLeft={2} flexDirection="column">
        <text
          {...(tip.color === 'warning'
            ? { fg: 'yellow' }
            : tip.color === 'error'
              ? { fg: 'red' }
              : { dimmed: true })}
        >
          {tip.tip}
        </text>
      </box>
    </Show>
  )
}
