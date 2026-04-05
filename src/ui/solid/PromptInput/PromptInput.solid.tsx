import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  type JSXElement,
} from 'solid-js'
import { feature } from 'bun:bundle'
import chalk from 'chalk'
import * as path from 'path'
import { useNotifications } from '../../../context/notifications.js'
import { useCommandQueue } from '../../../hooks/useCommandQueue.js'
import { type IDEAtMentioned, useIdeAtMentioned } from '../../../hooks/useIdeAtMentioned.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  type AppState,
  useAppState,
  useAppStateStore,
  useSetAppState,
} from 'src/state/AppState.js'
import type { FooterItem } from 'src/state/AppStateStore.js'
import { getCwd } from 'src/utils/cwd.js'
import { isQueuedCommandEditable, popAllEditable } from 'src/utils/messageQueueManager.js'
import stripAnsi from 'strip-ansi'
import { companionReservedColumns } from '../../../buddy/CompanionSprite.js'
import {
  findBuddyTriggerPositions,
  useBuddyNotification,
} from '../../../buddy/useBuddyNotification.js'
import { isUltrareviewEnabled } from '../../../commands/review/ultrareviewEnabled.js'
import { type Command, hasCommand } from '../../../commands.js'
import { useIsModalOverlayActive } from '../../../context/overlayContext.js'
import { useSetPromptOverlayDialog } from '../../../context/promptOverlayContext.js'
import {
  formatImageRef,
  formatPastedTextRef,
  getPastedTextRefNumLines,
  parseReferences,
} from '../../../history.js'
import type { VerificationStatus } from '../../../hooks/useApiKeyVerification.js'
import { type HistoryMode, useArrowKeyHistory } from '../../../hooks/useArrowKeyHistory.js'
import { useDoublePress } from '../../../hooks/useDoublePress.js'
import { useHistorySearch } from '../../../hooks/useHistorySearch.js'
import type { IDESelection } from '../../../hooks/useIdeSelection.js'
import { useInputBuffer } from '../../../hooks/useInputBuffer.js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { usePromptSuggestion } from '../../../hooks/usePromptSuggestion.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useTypeahead } from '../../../hooks/useTypeahead.js'
import type { BorderTextOptions } from '../../../ink/render-border.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useOptionalKeybindingContext } from '../../../keybindings/KeybindingContext.js'
import { getShortcutDisplay } from '../../../keybindings/shortcutFormat.js'
import { useKeybinding, useKeybindings } from '../../../keybindings/useKeybinding.js'
import type { MCPServerConnection } from '../../../services/mcp/types.js'
import {
  abortPromptSuggestion,
  logSuggestionSuppressed,
} from '../../../services/PromptSuggestion/promptSuggestion.js'
import {
  type ActiveSpeculationState,
  abortSpeculation,
} from '../../../services/PromptSuggestion/speculation.js'
import { getActiveAgentForInput, getViewedTeammateTask } from '../../../state/selectors.js'
import {
  enterTeammateView,
  exitTeammateView,
  stopOrDismissAgent,
} from '../../../state/teammateViewHelpers.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import { getRunningTeammatesSorted } from '../../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import {
  isPanelAgentTask,
  type LocalAgentTaskState,
} from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import { isBackgroundTask } from '../../../tasks/types.js'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { Message } from '../../../types/message.js'
import type { PermissionMode } from '../../../types/permissions.js'
import type {
  BaseTextInputProps,
  PromptInputMode,
  VimMode,
} from '../../../types/textInputTypes.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { count } from '../../../utils/array.js'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import { Cursor } from '../../../utils/Cursor.js'
import {
  getGlobalConfig,
  type PastedContent,
  saveGlobalConfig,
} from '../../../utils/config.js'
import { logForDebugging } from '../../../utils/debug.js'
import { errorMessage } from '../../../utils/errors.js'
import { isFastModeAvailable, isFastModeEnabled, isFastModeSupportedByModel } from '../../../utils/fastMode.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import type { PromptInputHelpers } from '../../../utils/handlePromptSubmit.js'
import { getImageFromClipboard, PASTE_THRESHOLD } from '../../../utils/imagePaste.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'
import { cacheImagePath, storeImage } from '../../../utils/imageStore.js'
import { logError } from '../../../utils/log.js'
import { modelDisplayString, isOpus1mMergeEnabled } from '../../../utils/model/model.js'
import { cyclePermissionMode, getNextPermissionMode } from '../../../utils/permissions/getNextPermissionMode.js'
import { transitionPermissionMode } from '../../../utils/permissions/permissionSetup.js'
import { editPromptInEditor } from '../../../utils/promptEditor.js'
import { hasAutoModeOptIn } from '../../../utils/settings/settings.js'
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from '../../../utils/thinking.js'
import { findSlashCommandPositions } from '../../../utils/suggestions/commandSuggestions.js'
import { isBilledAsExtraUsage } from '../../../utils/extraUsage.js'
import { isInProcessTeammate } from '../../../utils/teammateContext.js'
import { getTeammateColor } from '../../../utils/teammate.js'
import { syncTeammateMode } from '../../../utils/swarm/teamHelpers.js'
import type { TextHighlight } from '../../../utils/textHighlighting.js'
import type { Theme } from '../../../utils/theme.js'
import { getModeFromInput, getValueFromInput } from '../../../components/PromptInput/inputModes.js'
import { FOOTER_TEMPORARY_STATUS_TIMEOUT, Notifications } from './Notifications.solid.js'
import PromptInputFooter from './PromptInputFooter.solid.js'
import type { SuggestionItem } from '../../../components/PromptInput/PromptInputFooterSuggestions.js'
import { PromptInputModeIndicator } from '../../../components/PromptInput/PromptInputModeIndicator.js'
import { PromptInputQueuedCommands } from './PromptInputQueuedCommands.solid.js'
import { PromptInputStashNotice } from '../../../components/PromptInput/PromptInputStashNotice.js'
import { useMaybeTruncateInput } from '../../../components/PromptInput/useMaybeTruncateInput.js'
import { usePromptInputPlaceholder } from '../../../components/PromptInput/usePromptInputPlaceholder.js'
import { useShowFastIconHint } from '../../../components/PromptInput/useShowFastIconHint.js'
import { useSwarmBanner } from '../../../components/PromptInput/useSwarmBanner.js'
import { isNonSpacePrintable, isVimModeEnabled } from '../../../components/PromptInput/utils.js'
import { getVisibleAgentTasks, useCoordinatorTaskCount } from '../../../components/CoordinatorAgentStatus.js'
import { getEffortNotificationText } from '../../../components/EffortIndicator.js'
import { getFastIconString } from '../components/FastIcon.solid.js'
import TextInput from '../components/TextInput.solid.js'
import VimTextInput from '../components/VimTextInput.solid.js'
import type { ProcessUserInputContext } from '../../../utils/processUserInput/processUserInput.js'

// Bottom slot maxHeight="50%"; reserve lines for footer, border, status.
const PROMPT_FOOTER_LINES = 5
const MIN_INPUT_VIEWPORT_LINES = 3

type Props = {
  debug: boolean
  ideSelection: IDESelection | undefined
  toolPermissionContext: ToolPermissionContext
  setToolPermissionContext: (ctx: ToolPermissionContext) => void
  apiKeyStatus: VerificationStatus
  commands: Command[]
  agents: AgentDefinition[]
  isLoading: boolean
  verbose: boolean
  messages: Message[]
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void
  autoUpdaterResult: AutoUpdaterResult | null
  input: string
  onInputChange: (value: string) => void
  mode: PromptInputMode
  onModeChange: (mode: PromptInputMode) => void
  stashedPrompt:
    | { text: string; cursorOffset: number; pastedContents: Record<number, PastedContent> }
    | undefined
  setStashedPrompt: (
    value:
      | { text: string; cursorOffset: number; pastedContents: Record<number, PastedContent> }
      | undefined,
  ) => void
  submitCount: number
  onShowMessageSelector: () => void
  onMessageActionsEnter?: () => void
  mcpClients: MCPServerConnection[]
  pastedContents: Record<number, PastedContent>
  setPastedContents: (fn: Record<number, PastedContent> | ((prev: Record<number, PastedContent>) => Record<number, PastedContent>)) => void
  vimMode: VimMode
  setVimMode: (mode: VimMode) => void
  showBashesDialog: string | boolean
  setShowBashesDialog: (show: string | boolean) => void
  onExit: () => void
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  onSubmit: (
    input: string,
    helpers: PromptInputHelpers,
    speculationAccept?: {
      state: ActiveSpeculationState
      speculationSessionTimeSavedMs: number
      setAppState: (f: (prev: AppState) => AppState) => void
    },
    options?: { fromKeybinding?: boolean },
  ) => Promise<void>
  onAgentSubmit?: (
    input: string,
    task: InProcessTeammateTaskState | LocalAgentTaskState,
    helpers: PromptInputHelpers,
  ) => Promise<void>
  isSearchingHistory: boolean
  setIsSearchingHistory: (isSearching: boolean) => void
  onDismissSideQuestion?: () => void
  isSideQuestionVisible?: boolean
  helpOpen: boolean
  setHelpOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  hasSuppressedDialogs?: boolean
  isLocalJSXCommandActive?: boolean
  insertTextRef?: { current: { insert: (text: string) => void; setInputWithCursor: (value: string, cursor: number) => void; cursorOffset: number } | null }
  voiceInterimRange?: { start: number; end: number } | null
}

export function PromptInput(props: Props): JSXElement {
  const mainLoopModel = useMainLoopModel()
  const isModalOverlayActive = useIsModalOverlayActive() || (props.isLocalJSXCommandActive ?? false)

  // --- State signals ---
  const [isAutoUpdating, setIsAutoUpdating] = createSignal(false)
  const [exitMessage, setExitMessage] = createSignal<{ show: boolean; key?: string }>({ show: false })
  const [cursorOffset, setCursorOffset] = createSignal(props.input.length)
  let lastInternalInput = props.input

  // Track external input changes and move cursor to end
  createEffect(() => {
    if (props.input !== lastInternalInput) {
      setCursorOffset(props.input.length)
      lastInternalInput = props.input
    }
  })

  function trackAndSetInput(value: string) {
    lastInternalInput = value
    props.onInputChange(value)
  }

  // Expose insertText for STT
  createEffect(() => {
    if (props.insertTextRef) {
      props.insertTextRef.current = {
        cursorOffset: cursorOffset(),
        insert: (text: string) => {
          const needsSpace =
            cursorOffset() === props.input.length &&
            props.input.length > 0 &&
            !/\s$/.test(props.input)
          const insertText = needsSpace ? ' ' + text : text
          const newValue =
            props.input.slice(0, cursorOffset()) + insertText + props.input.slice(cursorOffset())
          lastInternalInput = newValue
          props.onInputChange(newValue)
          setCursorOffset(cursorOffset() + insertText.length)
        },
        setInputWithCursor: (value: string, cursor: number) => {
          lastInternalInput = value
          props.onInputChange(value)
          setCursorOffset(cursor)
        },
      }
    }
  })

  const store = useAppStateStore()
  const setAppState = useSetAppState()
  const tasks = useAppState((s: any) => s.tasks)
  const teamContext = useAppState((s: any) => s.teamContext)
  const queuedCommands = useCommandQueue()
  const promptSuggestionState = useAppState((s: any) => s.promptSuggestion)
  const speculation = useAppState((s: any) => s.speculation)
  const speculationSessionTimeSavedMs = useAppState((s: any) => s.speculationSessionTimeSavedMs)
  const viewingAgentTaskId = useAppState((s: any) => s.viewingAgentTaskId)
  const thinkingEnabled = useAppState((s: any) => s.thinkingEnabled)
  const isFastMode = useAppState((s: any) => (isFastModeEnabled() ? s.fastMode : false))
  const effortValue = useAppState((s: any) => s.effortValue)

  // In-process teammates
  const inProcessTeammates = createMemo(() => getRunningTeammatesSorted(tasks))
  const viewedTeammate = createMemo(() => getViewedTeammateTask(store.getState()))
  const viewingAgentName = createMemo(() => viewedTeammate()?.identity.agentName)

  // Effective tool permission context
  const effectiveToolPermissionContext = createMemo((): ToolPermissionContext => {
    const vt = viewedTeammate()
    if (vt) {
      return { ...props.toolPermissionContext, mode: vt.permissionMode }
    }
    return props.toolPermissionContext
  })

  // Paste ID counter
  let nextPasteId = (() => {
    let maxId = 0
    for (const message of props.messages) {
      if (message.type === 'user' && (message as any).imagePasteIds) {
        for (const id of (message as any).imagePasteIds) {
          if (id > maxId) maxId = id
        }
      }
    }
    return maxId + 1
  })()

  let pendingSpaceAfterPill = false

  // --- Dialog states ---
  const [showTeamsDialog, setShowTeamsDialog] = createSignal(false)
  const [showBridgeDialog, setShowBridgeDialog] = createSignal(false)
  const [isPasting, setIsPasting] = createSignal(false)
  const [isExternalEditorActive, setIsExternalEditorActive] = createSignal(false)
  const [showModelPicker, setShowModelPicker] = createSignal(false)
  const [showThinkingToggle, setShowThinkingToggle] = createSignal(false)
  const [showAutoModeOptIn, setShowAutoModeOptIn] = createSignal(false)
  const [teammateFooterIndex, setTeammateFooterIndex] = createSignal(0)

  // --- Input buffer (undo) ---
  const { pushToBuffer, undo, canUndo, clearBuffer } = useInputBuffer({
    maxBufferSize: 50,
    debounceMs: 1000,
  })

  // --- Cursor line detection ---
  const isCursorOnFirstLine = createMemo(() => {
    const idx = props.input.indexOf('\n')
    return idx === -1 || cursorOffset() <= idx
  })
  const isCursorOnLastLine = createMemo(() => {
    const idx = props.input.lastIndexOf('\n')
    return idx === -1 || cursorOffset() > idx
  })

  // --- Typeahead state ---
  const [suggestionsState, setSuggestionsState] = createSignal<{
    suggestions: SuggestionItem[]
    selectedSuggestion: number
    commandArgumentHint?: string
  }>({ suggestions: [], selectedSuggestion: -1, commandArgumentHint: undefined })

  // --- Notifications ---
  const { addNotification, removeNotification } = useNotifications()

  // --- Text highlights ---
  const displayedValue = createMemo(() => props.input)
  const thinkTriggers = createMemo(() => findThinkingTriggerPositions(displayedValue()))
  const slashCommandTriggers = createMemo(() => {
    const positions = findSlashCommandPositions(displayedValue())
    return positions.filter(pos => {
      const commandName = displayedValue().slice(pos.start + 1, pos.end)
      return hasCommand(commandName, props.commands)
    })
  })

  const combinedHighlights = createMemo((): TextHighlight[] => {
    const highlights: TextHighlight[] = []
    for (const trigger of slashCommandTriggers()) {
      highlights.push({
        start: trigger.start,
        end: trigger.end,
        color: 'suggestion',
        priority: 5,
      })
    }
    if (isUltrathinkEnabled()) {
      for (const trigger of thinkTriggers()) {
        for (let i = trigger.start; i < trigger.end; i++) {
          highlights.push({
            start: i,
            end: i + 1,
            color: getRainbowColor(i - trigger.start),
            shimmerColor: getRainbowColor(i - trigger.start, true),
            priority: 10,
          })
        }
      }
    }
    if (props.voiceInterimRange) {
      highlights.push({
        start: props.voiceInterimRange.start,
        end: props.voiceInterimRange.end,
        color: undefined,
        dimColor: true,
        priority: 1,
      })
    }
    return highlights
  })

  // --- Prompt suggestion ---
  const { suggestion: promptSuggestion, markAccepted, logOutcomeAtSubmission, markShown } =
    usePromptSuggestion({ inputValue: props.input, isAssistantResponding: props.isLoading })

  const showPromptSuggestion = createMemo(
    () =>
      props.mode === 'prompt' &&
      suggestionsState().suggestions.length === 0 &&
      promptSuggestion &&
      !viewingAgentTaskId,
  )

  createEffect(() => {
    if (showPromptSuggestion()) markShown()
  })

  // --- Placeholder ---
  const defaultPlaceholder = usePromptInputPlaceholder({
    input: props.input,
    submitCount: props.submitCount,
    viewingAgentName: viewingAgentName(),
  })
  const placeholder = createMemo(() =>
    showPromptSuggestion() && promptSuggestion ? promptSuggestion : defaultPlaceholder,
  )

  // --- onChange handler ---
  function onChange(value: string) {
    if (value === '?') {
      logEvent('tengu_help_toggled', {})
      props.setHelpOpen((v: boolean) => !v)
      return
    }
    props.setHelpOpen(false)
    removeNotification('stash-hint')
    abortPromptSuggestion()
    abortSpeculation(setAppState)

    const isSingleCharInsertion = value.length === props.input.length + 1
    const insertedAtStart = cursorOffset() === 0
    const mode = getModeFromInput(value)
    if (insertedAtStart && mode !== 'prompt') {
      if (isSingleCharInsertion) {
        props.onModeChange(mode)
        return
      }
      if (props.input.length === 0) {
        props.onModeChange(mode)
        const valueWithoutMode = getValueFromInput(value).replaceAll('\t', '    ')
        pushToBuffer(props.input, cursorOffset(), props.pastedContents)
        trackAndSetInput(valueWithoutMode)
        setCursorOffset(valueWithoutMode.length)
        return
      }
    }
    const processedValue = value.replaceAll('\t', '    ')
    if (props.input !== processedValue) {
      pushToBuffer(props.input, cursorOffset(), props.pastedContents)
    }
    setAppState((prev: any) =>
      prev.footerSelection === null ? prev : { ...prev, footerSelection: null },
    )
    trackAndSetInput(processedValue)
  }

  // --- Arrow key history ---
  const {
    resetHistory,
    onHistoryUp,
    onHistoryDown,
    dismissSearchHint,
    historyIndex,
  } = useArrowKeyHistory(
    (value: string, historyMode: HistoryMode, pastedContents: Record<number, PastedContent>) => {
      onChange(value)
      props.onModeChange(historyMode)
      props.setPastedContents(pastedContents)
    },
    props.input,
    props.pastedContents,
    setCursorOffset,
    props.mode,
  )

  // --- Submit handler ---
  async function onSubmit(inputParam: string) {
    inputParam = inputParam.trimEnd()
    const state = store.getState()
    if (state.footerSelection) return
    if (state.viewSelectionMode === 'selecting-agent') return

    const hasImages = Object.values(props.pastedContents).some((c: PastedContent) => c.type === 'image')
    const suggestionText = promptSuggestionState.text
    const inputMatchesSuggestion =
      inputParam.trim() === '' || inputParam === suggestionText

    if (inputMatchesSuggestion && suggestionText && !hasImages && !state.viewingAgentTaskId) {
      if (speculation.status === 'active') {
        markAccepted()
        logOutcomeAtSubmission(suggestionText, { skipReset: true })
        void props.onSubmit(suggestionText, { setCursorOffset, clearBuffer, resetHistory }, {
          state: speculation,
          speculationSessionTimeSavedMs,
          setAppState,
        })
        return
      }
      if (promptSuggestionState.shownAt > 0) {
        markAccepted()
        inputParam = suggestionText
      }
    }

    if (inputParam.trim() === '' && !hasImages) return

    if (promptSuggestionState.text && promptSuggestionState.shownAt > 0) {
      logOutcomeAtSubmission(inputParam)
    }
    removeNotification('stash-hint')

    const activeAgent = getActiveAgentForInput(store.getState())
    if (activeAgent.type !== 'leader' && props.onAgentSubmit) {
      logEvent('tengu_transcript_input_to_teammate', {})
      await props.onAgentSubmit(inputParam, activeAgent.task, {
        setCursorOffset,
        clearBuffer,
        resetHistory,
      })
      return
    }

    await props.onSubmit(inputParam, { setCursorOffset, clearBuffer, resetHistory })
  }

  // --- Image/text paste ---
  function onImagePaste(
    image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) {
    logEvent('tengu_paste_image', {})
    props.onModeChange('prompt')
    const pasteId = nextPasteId++
    const newContent: PastedContent = {
      id: pasteId,
      type: 'image',
      content: image,
      mediaType: mediaType || 'image/png',
      filename: filename || 'Pasted image',
      dimensions,
      sourcePath,
    }
    cacheImagePath(newContent)
    void storeImage(newContent)
    props.setPastedContents((prev: Record<number, PastedContent>) => ({ ...prev, [pasteId]: newContent }))
    const prefix = pendingSpaceAfterPill ? ' ' : ''
    insertTextAtCursor(prefix + formatImageRef(pasteId))
    pendingSpaceAfterPill = true
  }

  function insertTextAtCursor(text: string) {
    pushToBuffer(props.input, cursorOffset(), props.pastedContents)
    const newInput = props.input.slice(0, cursorOffset()) + text + props.input.slice(cursorOffset())
    trackAndSetInput(newInput)
    setCursorOffset(cursorOffset() + text.length)
  }

  // --- Keybinding handlers ---
  function handleUndo() {
    if (canUndo) {
      const previousState = undo()
      if (previousState) {
        trackAndSetInput(previousState.text)
        setCursorOffset(previousState.cursorOffset)
        props.setPastedContents(previousState.pastedContents)
      }
    }
  }

  function handleNewline() {
    pushToBuffer(props.input, cursorOffset(), props.pastedContents)
    const newInput =
      props.input.slice(0, cursorOffset()) + '\n' + props.input.slice(cursorOffset())
    trackAndSetInput(newInput)
    setCursorOffset(cursorOffset() + 1)
  }

  async function handleExternalEditor() {
    logEvent('tengu_external_editor_used', {})
    setIsExternalEditorActive(true)
    try {
      const result = await editPromptInEditor(props.input, props.pastedContents)
      if (result.error) {
        addNotification({
          key: 'external-editor-error',
          text: result.error,
          color: 'warning',
          priority: 'high',
        })
      }
      if (result.content !== null && result.content !== props.input) {
        pushToBuffer(props.input, cursorOffset(), props.pastedContents)
        trackAndSetInput(result.content)
        setCursorOffset(result.content.length)
      }
    } catch (err) {
      if (err instanceof Error) logError(err)
      addNotification({
        key: 'external-editor-error',
        text: `External editor failed: ${errorMessage(err)}`,
        color: 'warning',
        priority: 'high',
      })
    } finally {
      setIsExternalEditorActive(false)
    }
  }

  function handleStash() {
    if (props.input.trim() === '' && props.stashedPrompt !== undefined) {
      trackAndSetInput(props.stashedPrompt.text)
      setCursorOffset(props.stashedPrompt.cursorOffset)
      props.setPastedContents(props.stashedPrompt.pastedContents)
      props.setStashedPrompt(undefined)
    } else if (props.input.trim() !== '') {
      props.setStashedPrompt({
        text: props.input,
        cursorOffset: cursorOffset(),
        pastedContents: props.pastedContents,
      })
      trackAndSetInput('')
      setCursorOffset(0)
      props.setPastedContents({})
      saveGlobalConfig(c => (c.hasUsedStash ? c : { ...c, hasUsedStash: true }))
    }
  }

  function handleModelPicker() {
    setShowModelPicker(prev => !prev)
    if (props.helpOpen) props.setHelpOpen(false)
  }

  function handleThinkingToggle() {
    setShowThinkingToggle(prev => !prev)
    if (props.helpOpen) props.setHelpOpen(false)
  }

  function handleCycleMode() {
    const nextMode = getNextPermissionMode(props.toolPermissionContext, teamContext)
    const { context: preparedContext } = cyclePermissionMode(
      props.toolPermissionContext,
      teamContext,
    )
    logEvent('tengu_mode_cycle', {
      to: nextMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    setAppState((prev: any) => ({
      ...prev,
      toolPermissionContext: { ...preparedContext, mode: nextMode },
    }))
    props.setToolPermissionContext({ ...preparedContext, mode: nextMode })
    syncTeammateMode(nextMode, teamContext?.teamName)
    if (props.helpOpen) props.setHelpOpen(false)
  }

  function handleImagePaste() {
    void getImageFromClipboard().then(imageData => {
      if (imageData) {
        onImagePaste(imageData.base64, imageData.mediaType)
      } else {
        addNotification({
          key: 'no-image-in-clipboard',
          text: 'No image found in clipboard.',
          priority: 'immediate',
          timeoutMs: 1000,
        })
      }
    })
  }

  // Register keybindings
  useKeybindings(
    {
      'chat:undo': handleUndo,
      'chat:newline': handleNewline,
      'chat:externalEditor': () => void handleExternalEditor(),
      'chat:stash': handleStash,
      'chat:modelPicker': handleModelPicker,
      'chat:thinkingToggle': handleThinkingToggle,
      'chat:cycleMode': handleCycleMode,
      'chat:imagePaste': handleImagePaste,
    },
    { context: 'Chat', isActive: !isModalOverlayActive },
  )

  useKeybinding('chat:messageActions', () => props.onMessageActionsEnter?.(), {
    context: 'Chat',
    isActive: !isModalOverlayActive && !props.isSearchingHistory,
  })

  useKeybinding('help:dismiss', () => props.setHelpOpen(false), {
    context: 'Help',
    isActive: props.helpOpen,
  })

  // --- Swarm banner ---
  const swarmBanner = useSwarmBanner()

  // --- Terminal size ---
  const { columns, rows } = useTerminalSize()
  const companionSpeaking = feature('BUDDY')
    ? useAppState((s: any) => s.companionReaction !== undefined)
    : false
  const textInputColumns = createMemo(
    () => columns - 3 - companionReservedColumns(columns, companionSpeaking),
  )

  // --- Fast icon ---
  const fastModeCooldown = isFastModeEnabled() ? false : false // simplified
  const showFastIcon = createMemo(
    () => isFastModeEnabled() && isFastMode && isFastModeAvailable(),
  )
  const showFastIconHint = useShowFastIconHint(showFastIcon() ?? false)

  // --- Effort notification ---
  const effortNotificationText = createMemo(() =>
    getEffortNotificationText(effortValue, mainLoopModel),
  )
  createEffect(() => {
    const text = effortNotificationText()
    if (!text) {
      removeNotification('effort-level')
      return
    }
    addNotification({
      key: 'effort-level',
      text,
      priority: 'high',
      timeoutMs: 12_000,
    })
  })

  // --- Border color ---
  function getBorderColor(): keyof Theme {
    const modeColors: Record<string, keyof Theme> = { bash: 'bashBorder' }
    if (modeColors[props.mode]) return modeColors[props.mode]!
    if (isInProcessTeammate()) return 'promptBorder'
    const teammateColorName = getTeammateColor()
    if (
      teammateColorName &&
      AGENT_COLORS.includes(teammateColorName as AgentColorName)
    ) {
      return AGENT_COLOR_TO_THEME_COLOR[teammateColorName as AgentColorName]
    }
    return 'promptBorder'
  }

  // --- Render ---
  const maxVisibleLines = createMemo(() =>
    isFullscreenEnvEnabled()
      ? Math.max(MIN_INPUT_VIEWPORT_LINES, Math.floor(rows / 2) - PROMPT_FOOTER_LINES)
      : undefined,
  )

  const isInputWrapped = createMemo(() => props.input.includes('\n'))

  return (
    <Show
      when={!isExternalEditorActive()}
      fallback={
        <box
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          borderColor={getBorderColor()}
          borderStyle="round"
          borderLeft={false}
          borderRight={false}
          borderBottom
          width="100%"
        >
          <text dimmed>Save and close editor to continue...</text>
        </box>
      }
    >
      <box flexDirection="column" marginTop={1}>
        <Show when={!isFullscreenEnvEnabled()}>
          <PromptInputQueuedCommands />
        </Show>

        <Show when={props.hasSuppressedDialogs}>
          <box marginTop={1} marginLeft={2}>
            <text dimmed>Waiting for permission\u2026</text>
          </box>
        </Show>

        <PromptInputStashNotice hasStash={props.stashedPrompt !== undefined} />

        <box
          flexDirection="row"
          alignItems="flex-start"
          justifyContent="flex-start"
          borderColor={getBorderColor()}
          borderStyle="round"
          borderLeft={false}
          borderRight={false}
          borderBottom
          width="100%"
        >
          <PromptInputModeIndicator
            mode={props.mode}
            isLoading={props.isLoading}
            viewingAgentName={viewingAgentName()}
          />
          <box flexGrow={1} flexShrink={1}>
            <Show
              when={isVimModeEnabled()}
              fallback={
                <TextInput
                  multiline
                  onSubmit={(v: string) => void onSubmit(v)}
                  onChange={onChange}
                  value={props.input}
                  placeholder={placeholder()}
                  onExit={props.onExit}
                  columns={textInputColumns()}
                  maxVisibleLines={maxVisibleLines()}
                  cursorOffset={cursorOffset()}
                  onChangeCursorOffset={setCursorOffset}
                  highlights={combinedHighlights()}
                  focus={!props.isSearchingHistory && !isModalOverlayActive}
                  showCursor={!props.isSearchingHistory}
                />
              }
            >
              <VimTextInput
                multiline
                onSubmit={(v: string) => void onSubmit(v)}
                onChange={onChange}
                value={props.input}
                placeholder={placeholder()}
                onExit={props.onExit}
                columns={textInputColumns()}
                maxVisibleLines={maxVisibleLines()}
                cursorOffset={cursorOffset()}
                onChangeCursorOffset={setCursorOffset}
                highlights={combinedHighlights()}
                focus={!props.isSearchingHistory && !isModalOverlayActive}
                showCursor={!props.isSearchingHistory}
                initialMode={props.vimMode}
                onModeChange={props.setVimMode}
              />
            </Show>
          </box>
        </box>

        <PromptInputFooter
          apiKeyStatus={props.apiKeyStatus}
          debug={props.debug}
          exitMessage={exitMessage()}
          vimMode={isVimModeEnabled() ? props.vimMode : undefined}
          mode={props.mode}
          autoUpdaterResult={props.autoUpdaterResult}
          isAutoUpdating={isAutoUpdating()}
          verbose={props.verbose}
          onAutoUpdaterResult={props.onAutoUpdaterResult}
          onChangeIsUpdating={setIsAutoUpdating}
          suggestions={suggestionsState().suggestions}
          selectedSuggestion={suggestionsState().selectedSuggestion}
          toolPermissionContext={effectiveToolPermissionContext()}
          helpOpen={props.helpOpen}
          suppressHint={props.input.length > 0}
          isLoading={props.isLoading}
          isPasting={isPasting()}
          isInputWrapped={isInputWrapped()}
          messages={props.messages}
          isSearching={props.isSearchingHistory}
          historyQuery={''}
          setHistoryQuery={() => {}}
          historyFailedMatch={false}
        />
      </box>
    </Show>
  )
}
