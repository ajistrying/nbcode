import { createMemo, Show, type JSXElement } from 'solid-js'
import { isBridgeEnabled } from '../../../bridge/bridgeEnabled.js'
import { getBridgeStatus } from '../../../bridge/bridgeStatusUtil.js'
import { useSetPromptOverlay } from '../../../context/promptOverlayContext.js'
import type { VerificationStatus } from '../../../hooks/useApiKeyVerification.js'
import type { IDESelection } from '../../../hooks/useIdeSelection.js'
import { useSettings } from '../../../hooks/useSettings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { MCPServerConnection } from '../../../services/mcp/types.js'
import { useAppState } from '../../../state/AppState.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import type { Message } from '../../../types/message.js'
import type { PromptInputMode, VimMode } from '../../../types/textInputTypes.js'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { isUndercover } from '../../../utils/undercover.js'
import {
  CoordinatorTaskPanel,
  useCoordinatorTaskCount,
} from '../../solid/components/CoordinatorAgentStatus.js'
import {
  getLastAssistantMessageId,
  StatusLine,
  statusLineShouldDisplay,
} from '../../solid/components/StatusLine.js'
import { Notifications } from './Notifications.solid.js'
import { PromptInputFooterLeftSide } from './PromptInputFooterLeftSide.js'
import {
  PromptInputFooterSuggestions,
  type SuggestionItem,
} from './PromptInputFooterSuggestions.js'
import { PromptInputHelpMenu } from './PromptInputHelpMenu.js'

type Props = {
  apiKeyStatus: VerificationStatus
  debug: boolean
  exitMessage: { show: boolean; key?: string }
  vimMode: VimMode | undefined
  mode: PromptInputMode
  autoUpdaterResult: AutoUpdaterResult | null
  isAutoUpdating: boolean
  verbose: boolean
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void
  onChangeIsUpdating: (isUpdating: boolean) => void
  suggestions: SuggestionItem[]
  selectedSuggestion: number
  maxColumnWidth?: number
  toolPermissionContext: ToolPermissionContext
  helpOpen: boolean
  suppressHint: boolean
  isLoading: boolean
  tasksSelected: boolean
  teamsSelected: boolean
  bridgeSelected: boolean
  tmuxSelected: boolean
  teammateFooterIndex?: number
  ideSelection: IDESelection | undefined
  mcpClients?: MCPServerConnection[]
  isPasting?: boolean
  isInputWrapped?: boolean
  messages: Message[]
  isSearching: boolean
  historyQuery: string
  setHistoryQuery: (query: string) => void
  historyFailedMatch: boolean
  onOpenTasksDialog?: (taskId?: string) => void
}

export default function PromptInputFooter(props: Props): JSXElement {
  const settings = useSettings()
  const { columns, rows } = useTerminalSize()
  let messagesRef = props.messages
  // Keep ref current
  const getMessages = () => {
    messagesRef = props.messages
    return messagesRef
  }

  const lastAssistantMessageId = createMemo(() =>
    getLastAssistantMessageId(props.messages),
  )

  const isNarrow = () => columns < 80
  const isFullscreen = isFullscreenEnvEnabled()
  const isShort = () => isFullscreen && rows < 24

  const coordinatorTaskCount = useCoordinatorTaskCount()
  const coordinatorTaskIndex = useAppState((s: any) => s.coordinatorTaskIndex)
  const pillSelected = () =>
    props.tasksSelected &&
    (coordinatorTaskCount() === 0 || coordinatorTaskIndex() < 0)

  const suppressHint = () =>
    props.suppressHint ||
    statusLineShouldDisplay(settings) ||
    props.isSearching

  const overlayData = createMemo(() =>
    isFullscreen && props.suggestions.length
      ? {
          suggestions: props.suggestions,
          selectedSuggestion: props.selectedSuggestion,
          maxColumnWidth: props.maxColumnWidth,
        }
      : null,
  )
  useSetPromptOverlay(overlayData)

  return (
    <Show
      when={!props.suggestions.length || isFullscreen}
      fallback={
        <box paddingX={2} paddingY={0}>
          <PromptInputFooterSuggestions
            suggestions={props.suggestions}
            selectedSuggestion={props.selectedSuggestion}
            maxColumnWidth={props.maxColumnWidth}
          />
        </box>
      }
    >
      <Show
        when={!props.helpOpen}
        fallback={
          <PromptInputHelpMenu dimColor={true} fixedWidth={true} paddingX={2} />
        }
      >
        <>
          <box
            flexDirection={isNarrow() ? 'column' : 'row'}
            justifyContent={isNarrow() ? 'flex-start' : 'space-between'}
            paddingX={2}
            gap={isNarrow() ? 0 : 1}
          >
            <box flexDirection="column" flexShrink={isNarrow() ? 0 : 1}>
              <Show
                when={
                  props.mode === 'prompt' &&
                  !isShort() &&
                  !props.exitMessage.show &&
                  !(props.isPasting ?? false) &&
                  statusLineShouldDisplay(settings)
                }
              >
                <StatusLine
                  messagesRef={{ current: messagesRef }}
                  lastAssistantMessageId={lastAssistantMessageId()}
                  vimMode={props.vimMode}
                />
              </Show>
              <PromptInputFooterLeftSide
                exitMessage={props.exitMessage}
                vimMode={props.vimMode}
                mode={props.mode}
                toolPermissionContext={props.toolPermissionContext}
                suppressHint={suppressHint()}
                isLoading={props.isLoading}
                tasksSelected={pillSelected()}
                teamsSelected={props.teamsSelected}
                teammateFooterIndex={props.teammateFooterIndex}
                tmuxSelected={props.tmuxSelected}
                isPasting={props.isPasting ?? false}
                isSearching={props.isSearching}
                historyQuery={props.historyQuery}
                setHistoryQuery={props.setHistoryQuery}
                historyFailedMatch={props.historyFailedMatch}
                onOpenTasksDialog={props.onOpenTasksDialog}
              />
            </box>
            <box flexShrink={1} gap={1}>
              <Show when={!isFullscreen}>
                <Notifications
                  apiKeyStatus={props.apiKeyStatus}
                  autoUpdaterResult={props.autoUpdaterResult}
                  debug={props.debug}
                  isAutoUpdating={props.isAutoUpdating}
                  verbose={props.verbose}
                  messages={props.messages}
                  onAutoUpdaterResult={props.onAutoUpdaterResult}
                  onChangeIsUpdating={props.onChangeIsUpdating}
                  ideSelection={props.ideSelection}
                  mcpClients={props.mcpClients}
                  isInputWrapped={props.isInputWrapped}
                  isNarrow={isNarrow()}
                />
              </Show>
            </box>
          </box>
        </>
      </Show>
    </Show>
  )
}
