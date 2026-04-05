import { createSignal, createEffect, onCleanup, Show, For, type JSXElement } from 'solid-js'
import { extraUsage as extraUsageCommand } from '../../../commands/extra-usage/index.js'
import { formatCost } from '../../../cost-tracker.js'
import { getSubscriptionType } from '../../../utils/auth.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  type ExtraUsage,
  fetchUtilization,
  type RateLimit,
  type Utilization,
} from '../../../services/api/usage.js'
import { formatResetText } from '../../../utils/format.js'
import { logError } from '../../../utils/log.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { ConfigurableShortcutHint } from '../../solid/design-system/ConfigurableShortcutHint.js'
import { Byline } from '../../solid/design-system/Byline.js'
import { ProgressBar } from '../../solid/design-system/ProgressBar.js'
import {
  isEligibleForOverageCreditGrant,
  OverageCreditUpsell,
} from '../../solid/LogoV2/OverageCreditUpsell.js'

type LimitBarProps = {
  title: string
  limit: RateLimit
  maxWidth: number
  showTimeInReset?: boolean
  extraSubtext?: string
}

function LimitBar(props: LimitBarProps): JSXElement {
  const showTimeInReset = () => props.showTimeInReset ?? true

  if (props.limit.utilization === null) {
    return null
  }

  const usedText = () => `${Math.floor(props.limit.utilization!)}% used`

  const subtext = () => {
    let result: string | undefined
    if (props.limit.resets_at) {
      result = `Resets ${formatResetText(props.limit.resets_at, true, showTimeInReset())}`
    }
    if (props.extraSubtext) {
      result = result
        ? `${props.extraSubtext} · ${result}`
        : props.extraSubtext
    }
    return result
  }

  return (
    <Show
      when={props.maxWidth >= 62}
      fallback={
        <box flexDirection="column">
          <text>
            <text><b>{props.title}</b></text>
            <Show when={subtext()}>
              <text> </text>
              <text dimmed>· {subtext()}</text>
            </Show>
          </text>
          <ProgressBar
            ratio={props.limit.utilization! / 100}
            width={props.maxWidth}
            fillColor="rate_limit_fill"
            emptyColor="rate_limit_empty"
          />
          <text>{usedText()}</text>
        </box>
      }
    >
      <box flexDirection="column">
        <text><b>{props.title}</b></text>
        <box flexDirection="row" gap={1}>
          <ProgressBar
            ratio={props.limit.utilization! / 100}
            width={50}
            fillColor="rate_limit_fill"
            emptyColor="rate_limit_empty"
          />
          <text>{usedText()}</text>
        </box>
        <Show when={subtext()}>
          <text dimmed>{subtext()}</text>
        </Show>
      </box>
    </Show>
  )
}

export function Usage(): JSXElement {
  const [utilization, setUtilization] = createSignal<Utilization | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)
  const { columns } = useTerminalSize()

  const availableWidth = () => columns - 2
  const maxWidth = () => Math.min(availableWidth(), 80)

  const loadUtilization = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchUtilization()
      setUtilization(data)
    } catch (err) {
      logError(err as Error)
      const axiosError = err as { response?: { data?: unknown } }
      const responseBody = axiosError.response?.data
        ? jsonStringify(axiosError.response.data)
        : undefined
      setError(
        responseBody
          ? `Failed to load usage data: ${responseBody}`
          : 'Failed to load usage data',
      )
    } finally {
      setIsLoading(false)
    }
  }

  createEffect(() => {
    void loadUtilization()
  })

  useKeybinding(
    'settings:retry',
    () => {
      void loadUtilization()
    },
    {
      context: 'Settings',
      get isActive() {
        return !!error() && !isLoading()
      },
    },
  )

  return (
    <Show
      when={!error()}
      fallback={
        <box flexDirection="column" gap={1}>
          <text fg="error">Error: {error()}</text>
          <text dimmed>
            <Byline>
              <ConfigurableShortcutHint
                action="settings:retry"
                context="Settings"
                fallback="r"
                description="retry"
              />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Settings"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </text>
        </box>
      }
    >
      <Show
        when={utilization()}
        fallback={
          <box flexDirection="column" gap={1}>
            <text dimmed>Loading usage data…</text>
            <text dimmed>
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Settings"
                fallback="Esc"
                description="cancel"
              />
            </text>
          </box>
        }
      >
        {(util) => {
          const subscriptionType = getSubscriptionType()
          const showSonnetBar = () =>
            subscriptionType === 'max' ||
            subscriptionType === 'team' ||
            subscriptionType === null

          const limits = () => [
            { title: 'Current session', limit: util().five_hour },
            { title: 'Current week (all models)', limit: util().seven_day },
            ...(showSonnetBar()
              ? [
                  {
                    title: 'Current week (Sonnet only)',
                    limit: util().seven_day_sonnet,
                  },
                ]
              : []),
          ]

          return (
            <box flexDirection="column" gap={1} width="100%">
              <Show
                when={limits().some(({ limit }) => limit)}
                fallback={
                  <text dimmed>
                    /usage is only available for subscription plans.
                  </text>
                }
              >
                <For each={limits()}>
                  {({ title, limit }) => (
                    <Show when={limit}>
                      <LimitBar
                        title={title}
                        limit={limit!}
                        maxWidth={maxWidth()}
                      />
                    </Show>
                  )}
                </For>
              </Show>

              <Show when={util().extra_usage}>
                <ExtraUsageSection
                  extraUsage={util().extra_usage!}
                  maxWidth={maxWidth()}
                />
              </Show>

              <Show when={isEligibleForOverageCreditGrant()}>
                <OverageCreditUpsell maxWidth={maxWidth()} />
              </Show>

              <text dimmed>
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Settings"
                  fallback="Esc"
                  description="cancel"
                />
              </text>
            </box>
          )
        }}
      </Show>
    </Show>
  )
}

type ExtraUsageSectionProps = {
  extraUsage: ExtraUsage
  maxWidth: number
}

const EXTRA_USAGE_SECTION_TITLE = 'Extra usage'

function ExtraUsageSection(props: ExtraUsageSectionProps): JSXElement {
  const subscriptionType = getSubscriptionType()
  const isProOrMax =
    subscriptionType === 'pro' || subscriptionType === 'max'
  if (!isProOrMax) {
    return null
  }

  if (!props.extraUsage.is_enabled) {
    if (extraUsageCommand.isEnabled()) {
      return (
        <box flexDirection="column">
          <text><b>{EXTRA_USAGE_SECTION_TITLE}</b></text>
          <text dimmed>Extra usage not enabled · /extra-usage to enable</text>
        </box>
      )
    }
    return null
  }

  if (props.extraUsage.monthly_limit === null) {
    return (
      <box flexDirection="column">
        <text><b>{EXTRA_USAGE_SECTION_TITLE}</b></text>
        <text dimmed>Unlimited</text>
      </box>
    )
  }

  if (
    typeof props.extraUsage.used_credits !== 'number' ||
    typeof props.extraUsage.utilization !== 'number'
  ) {
    return null
  }

  const formattedUsedCredits = formatCost(props.extraUsage.used_credits / 100, 2)
  const formattedMonthlyLimit = formatCost(props.extraUsage.monthly_limit / 100, 2)
  const now = new Date()
  const oneMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return (
    <LimitBar
      title={EXTRA_USAGE_SECTION_TITLE}
      limit={{
        utilization: props.extraUsage.utilization,
        resets_at: oneMonthReset.toISOString(),
      }}
      showTimeInReset={false}
      extraSubtext={`${formattedUsedCredits} / ${formattedMonthlyLimit} spent`}
      maxWidth={props.maxWidth}
    />
  )
}
