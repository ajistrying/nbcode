import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { installOAuthTokens } from '../../../cli/handlers/auth.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { useTerminalNotification } from '../../../ink/useTerminalNotification.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getSSLErrorHint } from '../../../services/api/errorUtils.js'
import { sendNotification } from '../../../services/notifier.js'
import { OAuthService } from '../../../services/oauth/index.js'
import {
  getOauthAccountInfo,
  validateForceLoginOrg,
} from '../../../utils/auth.js'
import { logError } from '../../../utils/log.js'
import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js'

type Props = {
  onDone: () => void
  startingMessage?: string
  mode?: 'login' | 'setup-token'
  forceLoginMethod?: 'claudeai' | 'console'
}

type OAuthStatus =
  | { state: 'idle' }
  | { state: 'platform_setup' }
  | { state: 'ready_to_start' }
  | { state: 'waiting_for_login'; url: string }
  | { state: 'creating_api_key' }
  | { state: 'about_to_retry'; nextState: OAuthStatus }
  | { state: 'success'; token?: string }
  | { state: 'error'; message: string; toRetry?: OAuthStatus }

const PASTE_HERE_MSG = 'Paste code here if prompted > '

export function ConsoleOAuthFlow(props: Props) {
  const settings = getSettings_DEPRECATED() || {}
  const mode = props.mode ?? 'login'
  const forceLoginMethod =
    props.forceLoginMethod ?? settings.forceLoginMethod
  const orgUUID = settings.forceLoginOrgUUID
  const forcedMethodMessage =
    forceLoginMethod === 'claudeai'
      ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)'
      : forceLoginMethod === 'console'
        ? 'Login method pre-selected: API Usage Billing (Anthropic Console)'
        : null

  const terminal = useTerminalNotification()

  const [oauthStatus, setOAuthStatus] = createSignal<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return { state: 'ready_to_start' }
    }
    if (
      forceLoginMethod === 'claudeai' ||
      forceLoginMethod === 'console'
    ) {
      return { state: 'ready_to_start' }
    }
    return { state: 'idle' }
  })

  const [pastedCode, setPastedCode] = createSignal('')
  const [cursorOffset, setCursorOffset] = createSignal(0)
  const [oauthService] = createSignal(() => new OAuthService())
  const [loginWithClaudeAi, setLoginWithClaudeAi] = createSignal(
    mode === 'setup-token' || forceLoginMethod === 'claudeai',
  )
  const [showPastePrompt, setShowPastePrompt] = createSignal(false)
  const [urlCopied, setUrlCopied] = createSignal(false)
  const textInputColumns =
    useTerminalSize().columns - PASTE_HERE_MSG.length - 1

  // Log forced login method on mount
  onMount(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {})
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {})
    }
  })

  // Retry logic
  createEffect(() => {
    const status = oauthStatus()
    if (status.state === 'about_to_retry') {
      const timer = setTimeout(
        setOAuthStatus,
        1000,
        status.nextState,
      )
      onCleanup(() => clearTimeout(timer))
    }
  })

  // Handle Enter to continue on success state
  useKeybinding(
    'confirm:yes',
    () => {
      logEvent('tengu_oauth_success', {
        loginWithClaudeAi: loginWithClaudeAi(),
      })
      props.onDone()
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus().state === 'success' && mode !== 'setup-token',
    },
  )

  // Handle Enter to continue from platform setup
  useKeybinding(
    'confirm:yes',
    () => {
      setOAuthStatus({ state: 'idle' })
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus().state === 'platform_setup',
    },
  )

  // Handle Enter to retry on error state
  useKeybinding(
    'confirm:yes',
    () => {
      const status = oauthStatus()
      if (status.state === 'error' && status.toRetry) {
        setPastedCode('')
        setOAuthStatus({
          state: 'about_to_retry',
          nextState: status.toRetry,
        })
      }
    },
    {
      context: 'Confirmation',
      isActive:
        oauthStatus().state === 'error' &&
        !!(oauthStatus() as { toRetry?: OAuthStatus }).toRetry,
    },
  )

  // Handle paste code 'c' to copy URL
  createEffect(() => {
    const status = oauthStatus()
    if (
      pastedCode() === 'c' &&
      status.state === 'waiting_for_login' &&
      showPastePrompt() &&
      !urlCopied()
    ) {
      void setClipboard(status.url).then((raw) => {
        if (raw) process.stdout.write(raw)
        setUrlCopied(true)
        setTimeout(setUrlCopied, 2000, false)
      })
      setPastedCode('')
    }
  })

  async function handleSubmitCode(value: string, url: string) {
    try {
      const [authorizationCode, state] = value.split('#')
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message:
            'Invalid code. Please make sure the full code was copied',
          toRetry: { state: 'waiting_for_login', url },
        })
        return
      }
      logEvent('tengu_oauth_manual_entry', {})
      oauthService().handleManualAuthCodeInput({
        authorizationCode,
        state,
      })
    } catch (err: unknown) {
      logError(err)
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: { state: 'waiting_for_login', url },
      })
    }
  }

  const startOAuth = async () => {
    try {
      logEvent('tengu_oauth_flow_start', {
        loginWithClaudeAi: loginWithClaudeAi(),
      })
      const result = await oauthService().startOAuthFlow(
        async (url) => {
          setOAuthStatus({ state: 'waiting_for_login', url })
          setTimeout(setShowPastePrompt, 3000, true)
        },
        {
          loginWithClaudeAi: loginWithClaudeAi(),
          inferenceOnly: mode === 'setup-token',
          expiresIn:
            mode === 'setup-token'
              ? 365 * 24 * 60 * 60
              : undefined,
          orgUUID,
        },
      ).catch((err_1: Error) => {
        const isTokenExchangeError = err_1.message.includes(
          'Token exchange failed',
        )
        const sslHint = getSSLErrorHint(err_1)
        setOAuthStatus({
          state: 'error',
          message:
            sslHint ??
            (isTokenExchangeError
              ? 'Failed to exchange authorization code for access token. Please try again.'
              : err_1.message),
          toRetry:
            mode === 'setup-token'
              ? { state: 'ready_to_start' }
              : { state: 'idle' },
        })
        logEvent('tengu_oauth_token_exchange_error', {
          error: err_1.message,
          ssl_error: sslHint !== null,
        })
        throw err_1
      })
      if (mode === 'setup-token') {
        setOAuthStatus({ state: 'success', token: result.accessToken })
      } else {
        await installOAuthTokens(result)
        const orgResult = await validateForceLoginOrg()
        if (!orgResult.valid) {
          throw new Error(orgResult.message)
        }
        setOAuthStatus({ state: 'success' })
        void sendNotification(
          {
            message: 'Claude Code login successful',
            notificationType: 'auth_success',
          },
          terminal,
        )
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message
      const sslHint = getSSLErrorHint(err_0)
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle',
        },
      })
      logEvent('tengu_oauth_error', {
        error:
          errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null,
      })
    }
  }

  let pendingOAuthStart = false
  createEffect(() => {
    if (
      oauthStatus().state === 'ready_to_start' &&
      !pendingOAuthStart
    ) {
      pendingOAuthStart = true
      process.nextTick(() => {
        void startOAuth()
        pendingOAuthStart = false
      })
    }
  })

  // Auto-exit for setup-token mode
  createEffect(() => {
    if (mode === 'setup-token' && oauthStatus().state === 'success') {
      const timer = setTimeout(() => {
        logEvent('tengu_oauth_success', {
          loginWithClaudeAi: loginWithClaudeAi(),
        })
        props.onDone()
      }, 500)
      onCleanup(() => clearTimeout(timer))
    }
  })

  // Cleanup OAuth service when component unmounts
  onCleanup(() => {
    oauthService().cleanup()
  })

  const status = () => oauthStatus()

  return (
    <box flexDirection="column" gap={1}>
      <Show
        when={
          status().state === 'waiting_for_login' && showPastePrompt()
        }
      >
        <box flexDirection="column" gap={1} paddingBottom={1}>
          <box paddingX={1}>
            <text dimmed>
              Browser didn&apos;t open? Use the url below to sign in{' '}
            </text>
            <Show
              when={urlCopied()}
              fallback={<text dimmed>(c to copy)</text>}
            >
              <text fg="success">(Copied!)</text>
            </Show>
          </box>
          <text dimmed>
            {(status() as { url: string }).url}
          </text>
        </box>
      </Show>
      <Show
        when={
          mode === 'setup-token' &&
          status().state === 'success' &&
          (status() as { token?: string }).token
        }
      >
        <box flexDirection="column" gap={1} paddingTop={1}>
          <text fg="success">
            ✓ Long-lived authentication token created successfully!
          </text>
          <box flexDirection="column" gap={1}>
            <text>Your OAuth token (valid for 1 year):</text>
            <text fg="warning">
              {(status() as { token?: string }).token}
            </text>
            <text dimmed>
              Store this token securely. You won&apos;t be able to see
              it again.
            </text>
            <text dimmed>
              Use this token by setting: export
              CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
            </text>
          </box>
        </box>
      </Show>
      <box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage
          oauthStatus={status()}
          mode={mode}
          startingMessage={props.startingMessage}
          forcedMethodMessage={forcedMethodMessage}
          showPastePrompt={showPastePrompt()}
          pastedCode={pastedCode()}
          setPastedCode={setPastedCode}
          cursorOffset={cursorOffset()}
          setCursorOffset={setCursorOffset}
          textInputColumns={textInputColumns}
          handleSubmitCode={handleSubmitCode}
          setOAuthStatus={setOAuthStatus}
          setLoginWithClaudeAi={setLoginWithClaudeAi}
        />
      </box>
    </box>
  )
}

type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus
  mode: 'login' | 'setup-token'
  startingMessage: string | undefined
  forcedMethodMessage: string | null
  showPastePrompt: boolean
  pastedCode: string
  setPastedCode: (value: string) => void
  cursorOffset: number
  setCursorOffset: (offset: number) => void
  textInputColumns: number
  handleSubmitCode: (value: string, url: string) => void
  setOAuthStatus: (status: OAuthStatus) => void
  setLoginWithClaudeAi: (value: boolean) => void
}

function OAuthStatusMessage(props: OAuthStatusMessageProps) {
  switch (props.oauthStatus.state) {
    case 'idle': {
      const msg = props.startingMessage
        ? props.startingMessage
        : 'Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.'
      return (
        <box flexDirection="column" gap={1} marginTop={1}>
          <text>
            <b>{msg}</b>
          </text>
          <text>Select login method:</text>
          <box>
            {/* Select component would go here - kept as placeholder */}
            <text dimmed>
              [Login method selector - port Select component separately]
            </text>
          </box>
        </box>
      )
    }
    case 'platform_setup':
      return (
        <box flexDirection="column" gap={1} marginTop={1}>
          <text>
            <b>Using 3rd-party platforms</b>
          </text>
          <box flexDirection="column" gap={1}>
            <text>
              Claude Code supports Amazon Bedrock, Microsoft Foundry, and
              Vertex AI. Set the required environment variables, then
              restart Claude Code.
            </text>
            <text>
              If you are part of an enterprise organization, contact your
              administrator for setup instructions.
            </text>
            <box flexDirection="column" marginTop={1}>
              <text>
                <b>Documentation:</b>
              </text>
              <text>
                · Amazon Bedrock:
                https://code.claude.com/docs/en/amazon-bedrock
              </text>
              <text>
                · Microsoft Foundry:
                https://code.claude.com/docs/en/microsoft-foundry
              </text>
              <text>
                · Vertex AI:
                https://code.claude.com/docs/en/google-vertex-ai
              </text>
            </box>
            <box marginTop={1}>
              <text dimmed>
                Press <b>Enter</b> to go back to login options.
              </text>
            </box>
          </box>
        </box>
      )
    case 'waiting_for_login':
      return (
        <box flexDirection="column" gap={1}>
          <Show when={props.forcedMethodMessage}>
            <box>
              <text dimmed>{props.forcedMethodMessage}</text>
            </box>
          </Show>
          <Show when={!props.showPastePrompt}>
            <box>
              <text>Opening browser to sign in...</text>
            </box>
          </Show>
          <Show when={props.showPastePrompt}>
            <box>
              <text>{PASTE_HERE_MSG}</text>
              <text dimmed>[text input]</text>
            </box>
          </Show>
        </box>
      )
    case 'creating_api_key':
      return (
        <box flexDirection="column" gap={1}>
          <box>
            <text>Creating API key for Claude Code...</text>
          </box>
        </box>
      )
    case 'about_to_retry':
      return (
        <box flexDirection="column" gap={1}>
          <text fg="permission">Retrying...</text>
        </box>
      )
    case 'success':
      return (
        <box flexDirection="column">
          <Show
            when={
              !(
                props.mode === 'setup-token' &&
                (props.oauthStatus as { token?: string }).token
              )
            }
          >
            <Show when={getOauthAccountInfo()?.emailAddress}>
              <text dimmed>
                Logged in as{' '}
                <text>{getOauthAccountInfo()?.emailAddress}</text>
              </text>
            </Show>
            <text fg="success">
              Login successful. Press <b>Enter</b> to continue...
            </text>
          </Show>
        </box>
      )
    case 'error':
      return (
        <box flexDirection="column" gap={1}>
          <text fg="error">
            OAuth error: {props.oauthStatus.message}
          </text>
          <Show when={props.oauthStatus.toRetry}>
            <box marginTop={1}>
              <text fg="permission">
                Press <b>Enter</b> to retry.
              </text>
            </box>
          </Show>
        </box>
      )
    default:
      return null
  }
}
