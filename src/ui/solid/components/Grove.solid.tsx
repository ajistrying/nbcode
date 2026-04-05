import { createSignal, createEffect, onMount, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  type AccountSettings,
  calculateShouldShowGrove,
  type GroveConfig,
  getGroveNoticeConfig,
  getGroveSettings,
  markGroveNoticeViewed,
  updateGroveSettings,
} from '../../../services/api/grove.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../design-system/Byline.solid.js'
import { Dialog } from '../design-system/Dialog.solid.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.solid.js'

export type GroveDecision =
  | 'accept_opt_in'
  | 'accept_opt_out'
  | 'defer'
  | 'escape'
  | 'skip_rendering'

type Props = {
  showIfAlreadyViewed: boolean
  location: 'settings' | 'policy_update_modal' | 'onboarding'
  onDone: (decision: GroveDecision) => void
}

const NEW_TERMS_ASCII = ` _____________
 |          \\  \\
 | NEW TERMS \\__\\
 |              |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |              |
 |______________|`

function GracePeriodContentBody(): JSX.Element {
  return (
    <>
      <text>
        An update to our Consumer Terms and Privacy Policy will take effect on{' '}
        <b>October 8, 2025</b>. You can accept the updated terms
        today.
      </text>

      <box flexDirection="column">
        <text>What&apos;s changing?</text>

        <box paddingLeft={1}>
          <text>
            <text>· </text>
            <b>You can help improve Claude </b>
            <text>
              — Allow the use of your chats and coding sessions to train and
              improve Anthropic AI models. Change anytime in your Privacy
              Settings (
              <text>https://claude.ai/settings/data-privacy-controls</text>
              ).
            </text>
          </text>
        </box>
        <box paddingLeft={1}>
          <text>
            <text>· </text>
            <b>Updates to data retention </b>
            <text>
              — To help us improve our AI models and safety protections,
              we&apos;re extending data retention to 5 years.
            </text>
          </text>
        </box>
      </box>

      <text>
        Learn more (
        <text>https://www.anthropic.com/news/updates-to-our-consumer-terms</text>
        ) or read the updated Consumer Terms (
        <text>https://anthropic.com/legal/terms</text>) and Privacy
        Policy (<text>https://anthropic.com/legal/privacy</text>)
      </text>
    </>
  )
}

function PostGracePeriodContentBody(): JSX.Element {
  return (
    <>
      <text>We&apos;ve updated our Consumer Terms and Privacy Policy.</text>

      <box flexDirection="column" gap={1}>
        <text>What&apos;s changing?</text>

        <box flexDirection="column">
          <text><b>Help improve Claude</b></text>
          <text>
            Allow the use of your chats and coding sessions to train and improve
            Anthropic AI models. You can change this anytime in Privacy Settings
          </text>
          <text>https://claude.ai/settings/data-privacy-controls</text>
        </box>

        <box flexDirection="column">
          <text><b>How this affects data retention</b></text>
          <text>
            Turning ON the improve Claude setting extends data retention from 30
            days to 5 years. Turning it OFF keeps the default 30-day data
            retention. Delete data anytime.
          </text>
        </box>
      </box>

      <text>
        Learn more (
        <text>https://www.anthropic.com/news/updates-to-our-consumer-terms</text>
        ) or read the updated Consumer Terms (
        <text>https://anthropic.com/legal/terms</text>) and Privacy
        Policy (<text>https://anthropic.com/legal/privacy</text>)
      </text>
    </>
  )
}

export function GroveDialog(props: Props): JSX.Element {
  const [shouldShowDialog, setShouldShowDialog] = createSignal<boolean | null>(null)
  const [groveConfig, setGroveConfig] = createSignal<GroveConfig | null>(null)

  onMount(() => {
    async function checkGroveSettings() {
      const [settingsResult, configResult] = await Promise.all([
        getGroveSettings(),
        getGroveNoticeConfig(),
      ])

      const config = configResult.success ? configResult.data : null
      setGroveConfig(config)

      const shouldShow = calculateShouldShowGrove(
        settingsResult,
        configResult,
        props.showIfAlreadyViewed,
      )

      setShouldShowDialog(shouldShow)
      if (!shouldShow) {
        props.onDone('skip_rendering')
        return
      }
      void markGroveNoticeViewed()
      logEvent('tengu_grove_policy_viewed', {
        location:
          props.location as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        dismissable:
          config?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    void checkGroveSettings()
  })

  const onChange = async (
    value: 'accept_opt_in' | 'accept_opt_out' | 'defer' | 'escape',
  ) => {
    switch (value) {
      case 'accept_opt_in': {
        await updateGroveSettings(true)
        logEvent('tengu_grove_policy_submitted', {
          state: true,
          dismissable:
            groveConfig()?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        break
      }
      case 'accept_opt_out': {
        await updateGroveSettings(false)
        logEvent('tengu_grove_policy_submitted', {
          state: false,
          dismissable:
            groveConfig()?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        break
      }
      case 'defer':
        logEvent('tengu_grove_policy_dismissed', {
          state: true,
        })
        break
      case 'escape':
        logEvent('tengu_grove_policy_escaped', {})
        break
    }

    props.onDone(value)
  }

  const handleCancel = (): void => {
    if (groveConfig()?.notice_is_grace_period) {
      void onChange('defer')
      return
    }
    void onChange('escape')
  }

  const acceptOptions = () =>
    groveConfig()?.domain_excluded
      ? [
          {
            label:
              'Accept terms · Help improve Claude: OFF (for emails with your domain)',
            value: 'accept_opt_out',
          },
        ]
      : [
          {
            label: 'Accept terms · Help improve Claude: ON',
            value: 'accept_opt_in',
          },
          {
            label: 'Accept terms · Help improve Claude: OFF',
            value: 'accept_opt_out',
          },
        ]

  return (
    <Show when={shouldShowDialog() === true}>
      <Dialog
        title="Updates to Consumer Terms and Policies"
        color="professionalBlue"
        onCancel={handleCancel}
        inputGuide={(exitState: any) =>
          exitState.pending ? (
            <text>Press {exitState.keyName} again to exit</text>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <KeyboardShortcutHint shortcut="Esc" action="cancel" />
            </Byline>
          )
        }
      >
        <box flexDirection="row">
          <box flexDirection="column" gap={1} flexGrow={1}>
            <Show
              when={groveConfig()?.notice_is_grace_period}
              fallback={<PostGracePeriodContentBody />}
            >
              <GracePeriodContentBody />
            </Show>
          </box>
          <box flexShrink={0}>
            <text fg="professionalBlue">{NEW_TERMS_ASCII}</text>
          </box>
        </box>

        <box flexDirection="column" gap={1}>
          <box flexDirection="column">
            <text><b>Please select how you&apos;d like to continue</b></text>
            <text>Your choice takes effect immediately upon confirmation.</text>
          </box>

          <Select
            options={[
              ...acceptOptions(),
              ...(groveConfig()?.notice_is_grace_period
                ? [{ label: 'Not now', value: 'defer' }]
                : []),
            ]}
            onChange={(value: string) =>
              onChange(value as 'accept_opt_in' | 'accept_opt_out' | 'defer')
            }
            onCancel={handleCancel}
          />
        </box>
      </Dialog>
    </Show>
  )
}

type PrivacySettingsDialogProps = {
  settings: AccountSettings
  domainExcluded?: boolean
  onDone: () => void
}

export function PrivacySettingsDialog(props: PrivacySettingsDialogProps): JSX.Element {
  const [groveEnabled, setGroveEnabled] = createSignal(props.settings.grove_enabled)

  onMount(() => {
    logEvent('tengu_grove_privacy_settings_viewed', {})
  })

  // In SolidJS, keyboard handling would be via onKeyDown on a focused element
  const handleToggle = async () => {
    if (!props.domainExcluded) {
      const newValue = !groveEnabled()
      setGroveEnabled(newValue)
      await updateGroveSettings(newValue)
    }
  }

  const valueComponent = () => {
    if (props.domainExcluded) {
      return <text fg="error">false (for emails with your domain)</text>
    }
    if (groveEnabled()) {
      return <text fg="success">true</text>
    }
    return <text fg="error">false</text>
  }

  return (
    <Dialog
      title="Data Privacy"
      color="professionalBlue"
      onCancel={props.onDone}
      inputGuide={(exitState: any) =>
        exitState.pending ? (
          <text>Press {exitState.keyName} again to exit</text>
        ) : props.domainExcluded ? (
          <KeyboardShortcutHint shortcut="Esc" action="cancel" />
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter/Tab/Space" action="toggle" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <text>
        Review and manage your privacy settings at{' '}
        <text>https://claude.ai/settings/data-privacy-controls</text>
      </text>

      <box>
        <box width={44}>
          <text><b>Help improve Claude</b></text>
        </box>
        <box>{valueComponent()}</box>
      </box>
    </Dialog>
  )
}
