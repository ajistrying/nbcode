import { createSignal, createEffect, createMemo, onCleanup, Show, type JSXElement } from 'solid-js'
import type { Notification } from '../../../context/notifications.js'
import { useNotifications } from '../../../context/notifications.js'
import { logEvent } from '../../../services/analytics/index.js'
import { useAppState } from '../../../state/AppState.js'
import type { VerificationStatus } from '../../../hooks/useApiKeyVerification.js'
import { useIdeConnectionStatus } from '../../../hooks/useIdeConnectionStatus.js'
import type { IDESelection } from '../../../hooks/useIdeSelection.js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { calculateTokenWarningState } from '../../../services/compact/autoCompact.js'
import type { MCPServerConnection } from '../../../services/mcp/types.js'
import type { Message } from '../../../types/message.js'
import {
  getApiKeyHelperElapsedMs,
  getConfiguredApiKeyHelper,
  getSubscriptionType,
} from '../../../utils/auth.js'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import { getExternalEditor } from '../../../utils/editor.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { formatDuration } from '../../../utils/format.js'
import { setEnvHookNotifier } from '../../../utils/hooks/fileChangedWatcher.js'
import { toIDEDisplayName } from '../../../utils/ide.js'
import { getMessagesAfterCompactBoundary } from '../../../utils/messages.js'
import { tokenCountFromLastAPIResponse } from '../../../utils/tokens.js'
import { AutoUpdaterWrapper } from '../../solid/components/AutoUpdaterWrapper.js'
import { ConfigurableShortcutHint } from '../../solid/design-system/ConfigurableShortcutHint.js'
import { IdeStatusIndicator } from '../../solid/components/IdeStatusIndicator.js'
import { MemoryUsageIndicator } from '../../solid/components/MemoryUsageIndicator.js'
import { SentryErrorBoundary } from '../../solid/components/SentryErrorBoundary.js'
import { TokenWarning } from '../../solid/components/TokenWarning.js'
import { SandboxPromptFooterHint } from './SandboxPromptFooterHint.solid.js'

export const FOOTER_TEMPORARY_STATUS_TIMEOUT = 5000

type Props = {
  apiKeyStatus: VerificationStatus
  autoUpdaterResult: AutoUpdaterResult | null
  isAutoUpdating: boolean
  debug: boolean
  verbose: boolean
  messages: Message[]
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void
  onChangeIsUpdating: (isUpdating: boolean) => void
  ideSelection: IDESelection | undefined
  mcpClients?: MCPServerConnection[]
  isInputWrapped?: boolean
  isNarrow?: boolean
}

export function Notifications(props: Props): JSXElement {
  const isInputWrapped = () => props.isInputWrapped ?? false
  const isNarrow = () => props.isNarrow ?? false

  const tokenUsage = createMemo(() => {
    const messagesForTokenCount = getMessagesAfterCompactBoundary(props.messages)
    return tokenCountFromLastAPIResponse(messagesForTokenCount)
  })

  const mainLoopModel = useMainLoopModel()
  const isShowingCompactMessage = () =>
    calculateTokenWarningState(tokenUsage(), mainLoopModel).isAboveWarningThreshold

  const ideConnectionStatus = useIdeConnectionStatus(props.mcpClients)
  const notifications = useAppState((s: any) => s.notifications)
  const { addNotification, removeNotification } = useNotifications()

  // Register env hook notifier
  createEffect(() => {
    setEnvHookNotifier((text: string, isError: boolean) => {
      addNotification({
        key: 'env-hook',
        text,
        color: isError ? 'error' : undefined,
        priority: isError ? 'medium' : 'low',
        timeoutMs: isError ? 8000 : 5000,
      })
    })
    onCleanup(() => setEnvHookNotifier(null))
  })

  const shouldShowIdeSelection = () =>
    ideConnectionStatus.status === 'connected' &&
    (props.ideSelection?.filePath ||
      (props.ideSelection?.text && props.ideSelection.lineCount > 0))

  const shouldShowAutoUpdater = () =>
    !shouldShowIdeSelection() ||
    props.isAutoUpdating ||
    props.autoUpdaterResult?.status !== 'success'

  const isInOverageMode = false // simplified from claudeAiLimits
  const subscriptionType = getSubscriptionType()
  const isTeamOrEnterprise =
    subscriptionType === 'team' || subscriptionType === 'enterprise'

  const editor = getExternalEditor()
  const shouldShowExternalEditorHint = () =>
    isInputWrapped() &&
    !isShowingCompactMessage() &&
    props.apiKeyStatus !== 'invalid' &&
    props.apiKeyStatus !== 'missing' &&
    editor !== undefined

  createEffect(() => {
    if (shouldShowExternalEditorHint() && editor) {
      logEvent('tengu_external_editor_hint_shown', {})
      addNotification({
        key: 'external-editor-hint',
        jsx: (
          <text dimmed>
            <ConfigurableShortcutHint
              action="chat:externalEditor"
              context="Chat"
              fallback="ctrl+g"
              description={`edit in ${toIDEDisplayName(editor)}`}
            />
          </text>
        ),
        priority: 'immediate',
        timeoutMs: 5000,
      })
    } else {
      removeNotification('external-editor-hint')
    }
  })

  return (
    <SentryErrorBoundary>
      <box
        flexDirection="column"
        alignItems={isNarrow() ? 'flex-start' : 'flex-end'}
        flexShrink={0}
        overflowX="hidden"
      >
        <NotificationContent
          ideSelection={props.ideSelection}
          mcpClients={props.mcpClients}
          notifications={notifications()}
          isInOverageMode={isInOverageMode}
          isTeamOrEnterprise={isTeamOrEnterprise}
          apiKeyStatus={props.apiKeyStatus}
          debug={props.debug}
          verbose={props.verbose}
          tokenUsage={tokenUsage()}
          mainLoopModel={mainLoopModel}
          shouldShowAutoUpdater={shouldShowAutoUpdater()}
          autoUpdaterResult={props.autoUpdaterResult}
          isAutoUpdating={props.isAutoUpdating}
          isShowingCompactMessage={isShowingCompactMessage()}
          onAutoUpdaterResult={props.onAutoUpdaterResult}
          onChangeIsUpdating={props.onChangeIsUpdating}
        />
      </box>
    </SentryErrorBoundary>
  )
}

function NotificationContent(props: {
  ideSelection: IDESelection | undefined
  mcpClients?: MCPServerConnection[]
  notifications: { current: Notification | null; queue: Notification[] }
  isInOverageMode: boolean
  isTeamOrEnterprise: boolean
  apiKeyStatus: VerificationStatus
  debug: boolean
  verbose: boolean
  tokenUsage: number
  mainLoopModel: string
  shouldShowAutoUpdater: boolean
  autoUpdaterResult: AutoUpdaterResult | null
  isAutoUpdating: boolean
  isShowingCompactMessage: boolean
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void
  onChangeIsUpdating: (isUpdating: boolean) => void
}): JSXElement {
  const [apiKeyHelperSlow, setApiKeyHelperSlow] = createSignal<string | null>(
    null,
  )

  createEffect(() => {
    if (!getConfiguredApiKeyHelper()) return
    const interval = setInterval(() => {
      const ms = getApiKeyHelperElapsedMs()
      const next = ms >= 10_000 ? formatDuration(ms) : null
      setApiKeyHelperSlow((prev) => (next === prev ? prev : next))
    }, 1000)
    onCleanup(() => clearInterval(interval))
  })

  return (
    <>
      <IdeStatusIndicator
        ideSelection={props.ideSelection}
        mcpClients={props.mcpClients}
      />
      <Show when={props.notifications.current}>
        {(notification) => (
          <Show
            when={'jsx' in notification()}
            fallback={
              <text
                fg={(notification() as any).color}
                dimmed={!(notification() as any).color}
                wrap="truncate"
              >
                {(notification() as any).text}
              </text>
            }
          >
            <text wrap="truncate">{(notification() as any).jsx}</text>
          </Show>
        )}
      </Show>
      <Show when={props.isInOverageMode && !props.isTeamOrEnterprise}>
        <box>
          <text dimmed wrap="truncate">
            Now using extra usage
          </text>
        </box>
      </Show>
      <Show when={apiKeyHelperSlow()}>
        <box>
          <text fg="warning" wrap="truncate">
            apiKeyHelper is taking a while{' '}
          </text>
          <text dimmed wrap="truncate">
            ({apiKeyHelperSlow()})
          </text>
        </box>
      </Show>
      <Show
        when={
          props.apiKeyStatus === 'invalid' || props.apiKeyStatus === 'missing'
        }
      >
        <box>
          <text fg="error" wrap="truncate">
            {isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
              ? 'Authentication error · Try again'
              : 'Not logged in · Run /login'}
          </text>
        </box>
      </Show>
      <Show when={props.debug}>
        <box>
          <text fg="warning" wrap="truncate">
            Debug mode
          </text>
        </box>
      </Show>
      <Show
        when={
          props.apiKeyStatus !== 'invalid' &&
          props.apiKeyStatus !== 'missing' &&
          props.verbose
        }
      >
        <box>
          <text dimmed wrap="truncate">
            {props.tokenUsage} tokens
          </text>
        </box>
      </Show>
      <TokenWarning tokenUsage={props.tokenUsage} model={props.mainLoopModel} />
      <Show when={props.shouldShowAutoUpdater}>
        <AutoUpdaterWrapper
          verbose={props.verbose}
          onAutoUpdaterResult={props.onAutoUpdaterResult}
          autoUpdaterResult={props.autoUpdaterResult}
          isUpdating={props.isAutoUpdating}
          onChangeIsUpdating={props.onChangeIsUpdating}
          showSuccessMessage={!props.isShowingCompactMessage}
        />
      </Show>
      <MemoryUsageIndicator />
      <SandboxPromptFooterHint />
    </>
  )
}
