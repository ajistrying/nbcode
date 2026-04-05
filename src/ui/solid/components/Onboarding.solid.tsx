/**
 * Onboarding — SolidJS port of src/components/Onboarding.tsx
 *
 * Multi-step onboarding flow: preflight -> theme -> api-key -> oauth ->
 * security -> terminal-setup. Steps are conditional based on auth config.
 */
import { createSignal, createEffect, createMemo, onMount, Show, type JSX } from 'solid-js'
import { logEvent } from 'src/services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import { shouldOfferTerminalSetup } from '../../../commands/terminalSetup/terminalSetup.js'
import { isAnthropicAuthEnabled } from '../../../utils/auth.js'
import { normalizeApiKeyForConfig } from '../../../utils/authPortable.js'
import { getCustomApiKeyStatus } from '../../../utils/config.js'
import { env } from '../../../utils/env.js'
import { isRunningOnHomespace } from '../../../utils/envUtils.js'
import type { ThemeSetting } from '../../../utils/theme.js'

type StepId = 'preflight' | 'theme' | 'oauth' | 'api-key' | 'security' | 'terminal-setup'

interface OnboardingStep {
  id: StepId
  component: JSX.Element
}

type OnboardingProps = {
  onDone: () => void
  // Injected props to replace React hooks:
  theme: ThemeSetting
  setTheme: (theme: ThemeSetting) => void
  exitState: { pending: boolean; keyName: string }
}

export function Onboarding(props: OnboardingProps): JSX.Element {
  const [currentStepIndex, setCurrentStepIndex] = createSignal(0)
  const [skipOAuth, setSkipOAuth] = createSignal(false)
  const [oauthEnabled] = createSignal(() => isAnthropicAuthEnabled())

  onMount(() => {
    logEvent('tengu_began_setup', { oauthEnabled: oauthEnabled() })
  })

  // Derive api key needing approval
  const apiKeyNeedingApproval = createMemo(() => {
    if (!process.env.ANTHROPIC_API_KEY || isRunningOnHomespace()) return ''
    const customApiKeyTruncated = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY)
    if (getCustomApiKeyStatus(customApiKeyTruncated) === 'new') return customApiKeyTruncated
    return ''
  })

  // Build steps array
  const steps = createMemo(() => {
    const result: OnboardingStep[] = []
    if (oauthEnabled()) {
      result.push({
        id: 'preflight',
        component: <text>Preflight check...</text>,
      })
    }
    result.push({
      id: 'theme',
      component: <text>Choose a theme</text>,
    })
    if (apiKeyNeedingApproval()) {
      result.push({
        id: 'api-key',
        component: <text>Approve API key</text>,
      })
    }
    if (oauthEnabled()) {
      result.push({
        id: 'oauth',
        component: (
          <Show when={!skipOAuth()}>
            <text>OAuth flow</text>
          </Show>
        ),
      })
    }
    result.push({
      id: 'security',
      component: (
        <box flexDirection="column" gap={1} paddingLeft={1}>
          <text>
            <b>Security notes:</b>
          </text>
          <box flexDirection="column" width={70}>
            <text>1. Claude can make mistakes</text>
            <text dimmed>
              You should always review Claude's responses, especially when running code.
            </text>
            <text>2. Due to prompt injection risks, only use it with code you trust</text>
            <text dimmed>For more details see: https://code.claude.com/docs/en/security</text>
          </box>
        </box>
      ),
    })
    if (shouldOfferTerminalSetup()) {
      result.push({
        id: 'terminal-setup',
        component: (
          <box flexDirection="column" gap={1} paddingLeft={1}>
            <text>
              <b>Use Claude Code's terminal setup?</b>
            </text>
            <text>
              For the optimal coding experience, enable the recommended settings for your terminal:{' '}
              {env.terminal === 'Apple_Terminal'
                ? 'Option+Enter for newlines and visual bell'
                : 'Shift+Enter for newlines'}
            </text>
          </box>
        ),
      })
    }
    return result
  })

  const currentStep = () => steps()[currentStepIndex()]

  function goToNextStep() {
    if (currentStepIndex() < steps().length - 1) {
      const nextIndex = currentStepIndex() + 1
      setCurrentStepIndex(nextIndex)
      logEvent('tengu_onboarding_step', {
        oauthEnabled: oauthEnabled(),
        stepId: steps()[nextIndex]?.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    } else {
      props.onDone()
    }
  }

  function handleThemeSelection(newTheme: ThemeSetting) {
    props.setTheme(newTheme)
    goToNextStep()
  }

  function handleApiKeyDone(approved: boolean) {
    if (approved) setSkipOAuth(true)
    goToNextStep()
  }

  return (
    <box flexDirection="column">
      {/* Welcome header would go here */}
      <text>
        <b>Welcome to Claude Code</b>
      </text>
      <box flexDirection="column" marginTop={1}>
        {currentStep()?.component}
        <Show when={props.exitState.pending}>
          <box padding={1}>
            <text dimmed>Press {props.exitState.keyName} again to exit</text>
          </box>
        </Show>
      </box>
    </box>
  )
}

/**
 * SkippableStep — wraps a step that can be skipped.
 */
export function SkippableStep(props: {
  skip: boolean
  onSkip: () => void
  children: JSX.Element
}): JSX.Element | null {
  createEffect(() => {
    if (props.skip) {
      props.onSkip()
    }
  })

  return (
    <Show when={!props.skip}>{props.children}</Show>
  )
}
