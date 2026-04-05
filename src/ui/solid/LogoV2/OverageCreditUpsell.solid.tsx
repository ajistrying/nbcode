import { createSignal } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { logEvent } from '../../../services/analytics/index.js'
import {
  formatGrantAmount,
  getCachedOverageCreditGrant,
  refreshOverageCreditGrantCache,
} from '../../../services/api/overageCreditGrant.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { truncate } from '../../../utils/format.js'
import type { FeedConfig } from './Feed.js'

const MAX_IMPRESSIONS = 3

export function isEligibleForOverageCreditGrant(): boolean {
  const info = getCachedOverageCreditGrant()
  if (!info || !info.available || info.granted) return false
  return formatGrantAmount(info) !== null
}

export function shouldShowOverageCreditUpsell(): boolean {
  if (!isEligibleForOverageCreditGrant()) return false
  const config = getGlobalConfig()
  if (config.hasVisitedExtraUsage) return false
  if ((config.overageCreditUpsellSeenCount ?? 0) >= MAX_IMPRESSIONS) return false
  return true
}

export function maybeRefreshOverageCreditCache(): void {
  if (getCachedOverageCreditGrant() !== null) return
  void refreshOverageCreditGrantCache()
}

export function useShowOverageCreditUpsell(): boolean {
  const [show] = createSignal(() => {
    maybeRefreshOverageCreditCache()
    return shouldShowOverageCreditUpsell()
  })
  return show()
}

export function incrementOverageCreditUpsellSeenCount(): void {
  let newCount = 0
  saveGlobalConfig(prev => {
    newCount = (prev.overageCreditUpsellSeenCount ?? 0) + 1
    return {
      ...prev,
      overageCreditUpsellSeenCount: newCount,
    }
  })
  logEvent('tengu_overage_credit_upsell_shown', {
    seen_count: newCount,
  })
}

function getUsageText(amount: string): string {
  return `${amount} in extra usage for third-party apps · /extra-usage`
}

const FEED_SUBTITLE = 'On us. Works on third-party apps · /extra-usage'
function getFeedTitle(amount: string): string {
  return `${amount} in extra usage`
}

type Props = {
  maxWidth?: number
  twoLine?: boolean
}

export function OverageCreditUpsell(props: Props): JSX.Element {
  const info = getCachedOverageCreditGrant()
  const amount = info ? formatGrantAmount(info) : null

  return (
    <Show when={amount}>
      <Show
        when={props.twoLine}
        fallback={
          <text dimmed>{getUsageText(amount!)}</text>
        }
      >
        <text dimmed>
          <text fg="startupAccent">{getFeedTitle(amount!)}</text>
        </text>
        <text dimmed>{FEED_SUBTITLE}</text>
      </Show>
    </Show>
  )
}

export function overageCreditFeedConfig(): FeedConfig | null {
  const info = getCachedOverageCreditGrant()
  if (!info || !info.available || info.granted) return null
  const amount = formatGrantAmount(info)
  if (!amount) return null
  return {
    title: getFeedTitle(amount),
    subtitle: FEED_SUBTITLE,
  }
}
