import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { ERROR_MESSAGE_USER_ABORT } from '../../../services/compact/compact.js'
import { isRateLimitErrorMessage } from '../../../services/rateLimitMessages.js'
import { BLACK_CIRCLE } from '../../../constants/figures.js'
import { API_ERROR_MESSAGE_PREFIX, API_TIMEOUT_ERROR_MESSAGE, CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE, CUSTOM_OFF_SWITCH_MESSAGE, INVALID_API_KEY_ERROR_MESSAGE, INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL, ORG_DISABLED_ERROR_MESSAGE_ENV_KEY, ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH, PROMPT_TOO_LONG_ERROR_MESSAGE, startsWithApiErrorPrefix, TOKEN_REVOKED_ERROR_MESSAGE } from '../../../services/api/errors.js'
import { isEmptyMessageText, NO_RESPONSE_REQUESTED } from '../../../utils/messages.js'
import { getUpgradeMessage } from '../../../utils/model/contextWindowUpgradeCheck.js'
import { getDefaultSonnetModel, renderModelName } from '../../../utils/model/model.js'
import { isMacOsKeychainLocked } from '../../../utils/secureStorage/macOsKeychainStorage.js'
import { CtrlOToExpand } from '../../../components/CtrlOToExpand.js'
import { InterruptedByUser } from '../../../components/InterruptedByUser.js'
import { Markdown } from '../../../components/Markdown.js'
import { MessageResponse } from '../../../components/MessageResponse.js'
import { RateLimitMessage } from '../../../components/messages/RateLimitMessage.js'

const MAX_API_ERROR_CHARS = 1000

type Props = {
  param: TextBlockParam
  addMargin: boolean
  shouldShowDot: boolean
  verbose: boolean
  width?: number | string
  onOpenRateLimitOptions?: () => void
}

function InvalidApiKeyMessage(): JSX.Element {
  const isKeychainLocked = isMacOsKeychainLocked()
  return (
    <MessageResponse>
      <box flexDirection="column">
        <text fg="error">{INVALID_API_KEY_ERROR_MESSAGE}</text>
        <Show when={isKeychainLocked}>
          <text dimmed>{"\u00b7"} Run in another terminal: security unlock-keychain</text>
        </Show>
      </box>
    </MessageResponse>
  )
}

export function AssistantTextMessage(props: Props): JSX.Element {
  const text = () => props.param.text

  if (isEmptyMessageText(text())) {
    return null
  }
  if (isRateLimitErrorMessage(text())) {
    return <RateLimitMessage text={text()} onOpenRateLimitOptions={props.onOpenRateLimitOptions} />
  }

  switch (text()) {
    case NO_RESPONSE_REQUESTED:
      return null
    case PROMPT_TOO_LONG_ERROR_MESSAGE: {
      const upgradeHint = getUpgradeMessage('warning')
      return (
        <MessageResponse height={1}>
          <text fg="error">Context limit reached {"\u00b7"} /compact or /clear to continue{upgradeHint ? ` \u00b7 ${upgradeHint}` : ''}</text>
        </MessageResponse>
      )
    }
    case CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE:
      return (
        <MessageResponse height={1}>
          <text fg="error">Credit balance too low {"\u00b7"} Add funds: https://platform.claude.com/settings/billing</text>
        </MessageResponse>
      )
    case INVALID_API_KEY_ERROR_MESSAGE:
      return <InvalidApiKeyMessage />
    case INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL:
      return (
        <MessageResponse height={1}>
          <text fg="error">{INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL}</text>
        </MessageResponse>
      )
    case ORG_DISABLED_ERROR_MESSAGE_ENV_KEY:
    case ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH:
      return (
        <MessageResponse>
          <text fg="error">{text()}</text>
        </MessageResponse>
      )
    case TOKEN_REVOKED_ERROR_MESSAGE:
      return (
        <MessageResponse height={1}>
          <text fg="error">{TOKEN_REVOKED_ERROR_MESSAGE}</text>
        </MessageResponse>
      )
    case API_TIMEOUT_ERROR_MESSAGE:
      return (
        <MessageResponse height={1}>
          <text fg="error">{API_TIMEOUT_ERROR_MESSAGE}{process.env.API_TIMEOUT_MS && <> (API_TIMEOUT_MS={process.env.API_TIMEOUT_MS}ms, try increasing it)</>}</text>
        </MessageResponse>
      )
    case CUSTOM_OFF_SWITCH_MESSAGE:
      return (
        <MessageResponse>
          <box flexDirection="column" gap={1}>
            <text fg="error">We are experiencing high demand for Opus 4.</text>
            <text>To continue immediately, use /model to switch to {renderModelName(getDefaultSonnetModel())} and continue coding.</text>
          </box>
        </MessageResponse>
      )
    case ERROR_MESSAGE_USER_ABORT:
      return (
        <MessageResponse height={1}>
          <InterruptedByUser />
        </MessageResponse>
      )
    default: {
      if (startsWithApiErrorPrefix(text())) {
        const truncated = !props.verbose && text().length > MAX_API_ERROR_CHARS
        const displayText = truncated ? text().slice(0, MAX_API_ERROR_CHARS) + '\u2026' : text()
        return (
          <MessageResponse>
            <text fg="error">{displayText}</text>
          </MessageResponse>
        )
      }
      const marginTop = props.addMargin ? 1 : 0
      return (
        <box flexDirection="column" marginTop={marginTop} width={props.width ?? '100%'}>
          <Show when={props.shouldShowDot}>
            <text fg="assistant">{BLACK_CIRCLE}</text>
          </Show>
          <Markdown>{text()}</Markdown>
        </box>
      )
    }
  }
}
