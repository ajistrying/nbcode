import { createSignal, createEffect, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { extraUsage } from 'src/commands/extra-usage/index.js'
import { useClaudeAiLimits } from 'src/services/claudeAiLimitsHook.js'
import { shouldProcessMockLimits } from 'src/services/rateLimitMocking.js'
import { getRateLimitTier, getSubscriptionType, isClaudeAISubscriber } from 'src/utils/auth.js'
import { hasClaudeAiBillingAccess } from 'src/utils/billing.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

type UpsellParams = {
  shouldShowUpsell: boolean
  isMax20x: boolean
  isExtraUsageCommandEnabled: boolean
  shouldAutoOpenRateLimitOptionsMenu: boolean
  isTeamOrEnterprise: boolean
  hasBillingAccess: boolean
}

export function getUpsellMessage({
  shouldShowUpsell,
  isMax20x,
  isExtraUsageCommandEnabled,
  shouldAutoOpenRateLimitOptionsMenu,
  isTeamOrEnterprise,
  hasBillingAccess,
}: UpsellParams): string | null {
  if (!shouldShowUpsell) return null
  if (isMax20x) {
    if (isExtraUsageCommandEnabled) {
      return '/extra-usage to finish what you\u2019re working on.'
    }
    return '/login to switch to an API usage-billed account.'
  }
  if (shouldAutoOpenRateLimitOptionsMenu) {
    return 'Opening your options\u2026'
  }
  if (!isTeamOrEnterprise && !isExtraUsageCommandEnabled) {
    return '/upgrade to increase your usage limit.'
  }
  if (isTeamOrEnterprise) {
    if (!isExtraUsageCommandEnabled) return null
    if (hasBillingAccess) {
      return '/extra-usage to finish what you\u2019re working on.'
    }
    return '/extra-usage to request more usage from your admin.'
  }
  return '/upgrade or /extra-usage to finish what you\u2019re working on.'
}

type RateLimitMessageProps = {
  text: string
  onOpenRateLimitOptions?: () => void
}

export function RateLimitMessage(props: RateLimitMessageProps): JSX.Element {
  const subscriptionType = getSubscriptionType()
  const rateLimitTier = getRateLimitTier()
  const isTeamOrEnterprise =
    subscriptionType === 'team' || subscriptionType === 'enterprise'
  const isMax20x = rateLimitTier === 'default_claude_max_20x'
  const shouldShowUpsell = shouldProcessMockLimits() || isClaudeAISubscriber()
  const canSeeRateLimitOptionsUpsell = shouldShowUpsell && !isMax20x

  const [hasOpenedInteractiveMenu, setHasOpenedInteractiveMenu] = createSignal(false)
  const claudeAiLimits = useClaudeAiLimits()
  const isCurrentlyRateLimited = () =>
    claudeAiLimits.status === 'rejected' &&
    claudeAiLimits.resetsAt !== undefined &&
    !claudeAiLimits.isUsingOverage

  const shouldAutoOpenRateLimitOptionsMenu = () =>
    canSeeRateLimitOptionsUpsell &&
    !hasOpenedInteractiveMenu() &&
    isCurrentlyRateLimited() &&
    props.onOpenRateLimitOptions

  // Auto-open effect (runs when shouldAutoOpen becomes truthy)
  createEffect(() => {
    if (shouldAutoOpenRateLimitOptionsMenu()) {
      setHasOpenedInteractiveMenu(true)
      props.onOpenRateLimitOptions!()
    }
  })

  const message = () =>
    getUpsellMessage({
      shouldShowUpsell,
      isMax20x,
      isExtraUsageCommandEnabled: extraUsage.isEnabled(),
      shouldAutoOpenRateLimitOptionsMenu: !!shouldAutoOpenRateLimitOptionsMenu(),
      isTeamOrEnterprise,
      hasBillingAccess: hasClaudeAiBillingAccess(),
    })

  const upsell = () => {
    const msg = message()
    if (!msg) return null
    return <text dimmed>{msg}</text>
  }

  return (
    <MessageResponse>
      <box flexDirection="column">
        <text fg="error">{props.text}</text>
        <Show when={!hasOpenedInteractiveMenu()}>{upsell()}</Show>
      </box>
    </MessageResponse>
  )
}
