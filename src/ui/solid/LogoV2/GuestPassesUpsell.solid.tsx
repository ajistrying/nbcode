import { createSignal } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { logEvent } from '../../../services/analytics/index.js'
import {
  checkCachedPassesEligibility,
  formatCreditAmount,
  getCachedReferrerReward,
  getCachedRemainingPasses,
} from '../../../services/api/referral.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'

function resetIfPassesRefreshed(): void {
  const remaining = getCachedRemainingPasses()
  if (remaining == null || remaining <= 0) return
  const config = getGlobalConfig()
  const lastSeen = config.passesLastSeenRemaining ?? 0
  if (remaining > lastSeen) {
    saveGlobalConfig(prev => ({
      ...prev,
      passesUpsellSeenCount: 0,
      hasVisitedPasses: false,
      passesLastSeenRemaining: remaining,
    }))
  }
}

function shouldShowGuestPassesUpsell(): boolean {
  const { eligible, hasCache } = checkCachedPassesEligibility()
  if (!eligible || !hasCache) return false
  resetIfPassesRefreshed()
  const config = getGlobalConfig()
  if ((config.passesUpsellSeenCount ?? 0) >= 3) return false
  if (config.hasVisitedPasses) return false
  return true
}

export function useShowGuestPassesUpsell(): boolean {
  const [show] = createSignal(() => shouldShowGuestPassesUpsell())
  return show()
}

export function incrementGuestPassesSeenCount(): void {
  let newCount = 0
  saveGlobalConfig(prev => {
    newCount = (prev.passesUpsellSeenCount ?? 0) + 1
    return {
      ...prev,
      passesUpsellSeenCount: newCount,
    }
  })
  logEvent('tengu_guest_passes_upsell_shown', {
    seen_count: newCount,
  })
}

export function GuestPassesUpsell(): JSX.Element {
  const reward = getCachedReferrerReward()
  return (
    <text dimmed>
      <text fg="startupAccent">[✻]</text> <text fg="startupAccent">[✻]</text>{' '}
      <text fg="startupAccent">[✻]</text> ·{' '}
      {reward
        ? `Share Noble Base Code and earn ${formatCreditAmount(reward)} of extra usage · /passes`
        : '3 guest passes at /passes'}
    </text>
  )
}
