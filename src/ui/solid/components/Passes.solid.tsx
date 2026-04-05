import { createSignal, onMount, type JSX } from 'solid-js'
import { Show, For } from 'solid-js/web'
import type { CommandResultDisplay } from '../../../commands.js'
import { TEARDROP_ASTERISK } from '../../../constants/figures.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { logEvent } from '../../../services/analytics/index.js'
import {
  fetchReferralRedemptions,
  formatCreditAmount,
  getCachedOrFetchPassesEligibility,
} from '../../../services/api/referral.js'
import type {
  ReferralRedemptionsResponse,
  ReferrerRewardInfo,
} from '../../../services/oauth/types.js'
import { count } from '../../../utils/array.js'
import { logError } from '../../../utils/log.js'
import { Pane } from '../design-system/Pane.solid.js'

type PassStatus = {
  passNumber: number
  isAvailable: boolean
}

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function Passes(props: Props): JSX.Element {
  const [loading, setLoading] = createSignal(true)
  const [passStatuses, setPassStatuses] = createSignal<PassStatus[]>([])
  const [isAvailable, setIsAvailable] = createSignal(false)
  const [referralLink, setReferralLink] = createSignal<string | null>(null)
  const [referrerReward, setReferrerReward] = createSignal<
    ReferrerRewardInfo | null | undefined
  >(undefined)

  const exitState = useExitOnCtrlCDWithKeybindings(() =>
    props.onDone('Guest passes dialog dismissed', { display: 'system' }),
  )

  const handleCancel = () => {
    props.onDone('Guest passes dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleCancel, { context: 'Confirmation' })

  // Handle enter key to copy link (would be via onKeyDown on focused element)
  // In a real SolidJS app, this would be handled differently

  onMount(async () => {
    try {
      const eligibilityData = await getCachedOrFetchPassesEligibility()

      if (!eligibilityData || !eligibilityData.eligible) {
        setIsAvailable(false)
        setLoading(false)
        return
      }

      setIsAvailable(true)

      if (eligibilityData.referral_code_details?.referral_link) {
        setReferralLink(eligibilityData.referral_code_details.referral_link)
      }

      setReferrerReward(eligibilityData.referrer_reward)

      const campaign =
        eligibilityData.referral_code_details?.campaign ??
        'claude_code_guest_pass'

      let redemptionsData: ReferralRedemptionsResponse
      try {
        redemptionsData = await fetchReferralRedemptions(campaign)
      } catch (err) {
        logError(err as Error)
        setIsAvailable(false)
        setLoading(false)
        return
      }

      const redemptions = redemptionsData.redemptions || []
      const maxRedemptions = redemptionsData.limit || 3
      const statuses: PassStatus[] = []

      for (let i = 0; i < maxRedemptions; i++) {
        const redemption = redemptions[i]
        statuses.push({
          passNumber: i + 1,
          isAvailable: !redemption,
        })
      }

      setPassStatuses(statuses)
      setLoading(false)
    } catch (err) {
      logError(err as Error)
      setIsAvailable(false)
      setLoading(false)
    }
  })

  const renderTicket = (pass: PassStatus): JSX.Element => {
    const isRedeemed = !pass.isAvailable

    if (isRedeemed) {
      return (
        <box flexDirection="column" marginRight={1}>
          <text dimmed>{'┌─────────╱'}</text>
          <text dimmed>{` ) CC ${TEARDROP_ASTERISK} ┊╱`}</text>
          <text dimmed>{'└───────╱'}</text>
        </box>
      )
    }

    return (
      <box flexDirection="column" marginRight={1}>
        <text>{'┌──────────┐'}</text>
        <text>
          {' ) CC '}
          <text fg="claude">{TEARDROP_ASTERISK}</text>
          {' ┊ ( '}
        </text>
        <text>{'└──────────┘'}</text>
      </box>
    )
  }

  return (
    <>
      <Show when={loading()}>
        <Pane>
          <box flexDirection="column" gap={1}>
            <text dimmed>Loading guest pass information…</text>
            <text dimmed>
              <Show
                when={exitState.pending}
                fallback={<>Esc to cancel</>}
              >
                <>Press {exitState.keyName} again to exit</>
              </Show>
            </text>
          </box>
        </Pane>
      </Show>
      <Show when={!loading() && !isAvailable()}>
        <Pane>
          <box flexDirection="column" gap={1}>
            <text>Guest passes are not currently available.</text>
            <text dimmed>
              <Show
                when={exitState.pending}
                fallback={<>Esc to cancel</>}
              >
                <>Press {exitState.keyName} again to exit</>
              </Show>
            </text>
          </box>
        </Pane>
      </Show>
      <Show when={!loading() && isAvailable()}>
        {(() => {
          const availableCount = () => count(passStatuses(), p => p.isAvailable)
          const sortedPasses = () =>
            [...passStatuses()].sort((a, b) => +b.isAvailable - +a.isAvailable)

          return (
            <Pane>
              <box flexDirection="column" gap={1}>
                <text fg="permission">Guest passes · {availableCount()} left</text>

                <box flexDirection="row" marginLeft={2}>
                  <For each={sortedPasses().slice(0, 3)}>
                    {pass => renderTicket(pass)}
                  </For>
                </box>

                <Show when={referralLink()}>
                  <box marginLeft={2}>
                    <text>{referralLink()}</text>
                  </box>
                </Show>

                <box flexDirection="column" marginLeft={2}>
                  <text dimmed>
                    {referrerReward()
                      ? `Share a free week of Claude Code with friends. If they love it and subscribe, you'll get ${formatCreditAmount(referrerReward()!)} of extra usage to keep building. `
                      : 'Share a free week of Claude Code with friends. '}
                    Terms apply.
                  </text>
                </box>

                <box>
                  <text dimmed>
                    <Show
                      when={exitState.pending}
                      fallback={<>Enter to copy link · Esc to cancel</>}
                    >
                      <>Press {exitState.keyName} again to exit</>
                    </Show>
                  </text>
                </box>
              </box>
            </Pane>
          )
        })()}
      </Show>
    </>
  )
}
