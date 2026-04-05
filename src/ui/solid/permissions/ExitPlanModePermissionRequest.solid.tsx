import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import figures from 'figures'
import { createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js'
import { useNotifications } from 'src/context/notifications.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from 'src/state/AppState.js'
import {
  getSdkBetas,
  getSessionId,
  isSessionPersistenceDisabled,
  setHasExitedPlanMode,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
} from '../../../bootstrap/state.js'
import { generateSessionName } from '../../../commands/rename/generateSessionName.js'
import { launchUltraplan } from '../../../commands/ultraplan.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import type { AppState } from '../../../state/AppStateStore.js'
import { AGENT_TOOL_NAME } from '../../../tools/AgentTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../../../tools/ExitPlanModeTool/constants.js'
import type { AllowedPrompt } from '../../../tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { TEAM_CREATE_TOOL_NAME } from '../../../tools/TeamCreateTool/constants.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import {
  calculateContextPercentages,
  getContextWindowForModel,
} from '../../../utils/context.js'
import { getExternalEditor } from '../../../utils/editor.js'
import { getDisplayPath } from '../../../utils/file.js'
import { toIDEDisplayName } from '../../../utils/ide.js'
import { logError } from '../../../utils/log.js'
import { enqueuePendingNotification } from '../../../utils/messageQueueManager.js'
import { createUserMessage } from '../../../utils/messages.js'
import {
  getMainLoopModel,
  getRuntimeMainLoopModel,
} from '../../../utils/model/model.js'
import {
  createPromptRuleContent,
  isClassifierPermissionsEnabled,
  PROMPT_PREFIX,
} from '../../../utils/permissions/bashClassifier.js'
import {
  type PermissionMode,
  toExternalPermissionMode,
} from '../../../utils/permissions/PermissionMode.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import {
  isAutoModeGateEnabled,
  restoreDangerousPermissions,
  stripDangerousPermissionsForAutoMode,
} from '../../../utils/permissions/permissionSetup.js'
import {
  getPewterLedgerVariant,
  isPlanModeInterviewPhaseEnabled,
} from '../../../utils/planModeV2.js'
import { getPlan, getPlanFilePath } from '../../../utils/plans.js'
import {
  editFileInEditor,
  editPromptInEditor,
} from '../../../utils/promptEditor.js'
import {
  getCurrentSessionTitle,
  getTranscriptPath,
  saveAgentName,
  saveCustomTitle,
} from '../../../utils/sessionStorage.js'
import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js'
import type { PastedContent } from '../../../utils/config.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'
import { maybeResizeAndDownsampleImageBlock } from '../../../utils/imageResizer.js'
import { cacheImagePath, storeImage } from '../../../utils/imageStore.js'
import type { PermissionRequestProps } from '../../../components/permissions/PermissionRequest.js'
import type { Base64ImageSource, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../../utils/permissions/autoModeState.js') as typeof import('../../../utils/permissions/autoModeState.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

type ResponseValue =
  | 'yes-bypass-permissions'
  | 'yes-accept-edits'
  | 'yes-accept-edits-keep-context'
  | 'yes-default-keep-context'
  | 'yes-resume-auto-mode'
  | 'yes-auto-clear-context'
  | 'ultraplan'
  | 'no'

export function buildPermissionUpdates(
  mode: PermissionMode,
  allowedPrompts?: AllowedPrompt[],
): PermissionUpdate[] {
  const updates: PermissionUpdate[] = [
    {
      type: 'setMode',
      mode: toExternalPermissionMode(mode),
      destination: 'session',
    },
  ]
  if (
    isClassifierPermissionsEnabled() &&
    allowedPrompts &&
    allowedPrompts.length > 0
  ) {
    updates.push({
      type: 'addRules',
      rules: allowedPrompts.map((p) => ({
        toolName: p.tool,
        ruleContent: createPromptRuleContent(p.prompt),
      })),
      behavior: 'allow',
      destination: 'session',
    })
  }
  return updates
}

export function autoNameSessionFromPlan(
  plan: string,
  setAppState: (
    updater: (prev: AppState) => AppState,
  ) => void,
  isClearContext: boolean,
): void {
  if (
    isSessionPersistenceDisabled() ||
    getSettings_DEPRECATED()?.cleanupPeriodDays === 0
  ) {
    return
  }
  if (
    !isClearContext &&
    getCurrentSessionTitle(getSessionId())
  )
    return
  void generateSessionName(
    [
      createUserMessage({
        content: plan.slice(0, 1000),
      }),
    ],
    new AbortController().signal,
  )
    .then(async (name) => {
      if (!name || getCurrentSessionTitle(getSessionId()))
        return
      const sessionId = getSessionId() as UUID
      const fullPath = getTranscriptPath()
      await saveCustomTitle(sessionId, name, fullPath, 'auto')
      await saveAgentName(sessionId, name, fullPath, 'auto')
      setAppState((prev) => {
        if (prev.standaloneAgentContext?.name === name)
          return prev
        return {
          ...prev,
          standaloneAgentContext: {
            ...prev.standaloneAgentContext,
            name,
          },
        }
      })
    })
    .catch(logError)
}

export function ExitPlanModePermissionRequest(
  props: PermissionRequestProps,
) {
  const toolPermissionContext = useAppState(
    (s) => s.toolPermissionContext,
  )
  const setAppState = useSetAppState()
  const store = useAppStateStore()
  const { addNotification } = useNotifications()

  const [planFeedback, setPlanFeedback] = createSignal('')
  const [pastedContents, setPastedContents] = createSignal<
    Record<number, PastedContent>
  >({})
  let nextPasteIdRef = 0
  const showClearContext = () =>
    useAppState((s) => s.settings.showClearContextOnPlanAccept) ??
    false
  const ultraplanSessionUrl = () =>
    useAppState((s) => s.ultraplanSessionUrl)
  const ultraplanLaunching = () =>
    useAppState((s) => s.ultraplanLaunching)
  const showUltraplan = () =>
    feature('ULTRAPLAN')
      ? !ultraplanSessionUrl() && !ultraplanLaunching()
      : false

  const usage = props.toolUseConfirm.assistantMessage.message.usage
  const { mode, isAutoModeAvailable, isBypassPermissionsModeAvailable } =
    toolPermissionContext

  const isV2 = () =>
    props.toolUseConfirm.tool.name === EXIT_PLAN_MODE_V2_TOOL_NAME
  const inputPlan = () =>
    isV2()
      ? undefined
      : (props.toolUseConfirm.input.plan as string | undefined)
  const planFilePath = () => (isV2() ? getPlanFilePath() : undefined)
  const allowedPrompts = () =>
    props.toolUseConfirm.input.allowedPrompts as
      | AllowedPrompt[]
      | undefined

  const rawPlan = () => inputPlan() ?? getPlan()
  const isEmpty = () => !rawPlan() || rawPlan()!.trim() === ''

  const [planStructureVariant] = createSignal(
    () =>
      (getPewterLedgerVariant() ??
        undefined) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  )

  const [currentPlan, setCurrentPlan] = createSignal(() => {
    if (inputPlan()) return inputPlan()!
    const plan = getPlan()
    return (
      plan ??
      'No plan found. Please write your plan to the plan file first.'
    )
  })

  const [showSaveMessage, setShowSaveMessage] = createSignal(false)
  const [planEditedLocally, setPlanEditedLocally] = createSignal(false)

  // Auto-hide save message after 5 seconds
  createEffect(() => {
    if (showSaveMessage()) {
      const timer = setTimeout(setShowSaveMessage, 5000, false)
      onCleanup(() => clearTimeout(timer))
    }
  })

  const onImagePaste = (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
  ) => {
    const pasteId = nextPasteIdRef++
    const newContent: PastedContent = {
      id: pasteId,
      type: 'image',
      content: base64Image,
      mediaType: mediaType || 'image/png',
      filename: filename || 'Pasted image',
      dimensions,
    }
    cacheImagePath(newContent)
    void storeImage(newContent)
    setPastedContents((prev) => ({
      ...prev,
      [pasteId]: newContent,
    }))
  }

  const onRemoveImage = (id: number) => {
    setPastedContents((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const imageAttachments = () =>
    Object.values(pastedContents()).filter(
      (c) => c.type === 'image',
    )
  const hasImages = () => imageAttachments().length > 0

  const editor = getExternalEditor()
  const editorName = editor ? toIDEDisplayName(editor) : null

  // Handle Ctrl+G to edit plan in $EDITOR
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrl && e.key === 'g') {
      e.preventDefault()
      logEvent('tengu_plan_external_editor_used', {})
      void (async () => {
        if (isV2() && planFilePath()) {
          const result = await editFileInEditor(planFilePath()!)
          if (result.error) {
            addNotification({
              key: 'external-editor-error',
              text: result.error,
              color: 'warning',
              priority: 'high',
            })
          }
          if (result.content !== null) {
            if (result.content !== currentPlan())
              setPlanEditedLocally(true)
            setCurrentPlan(result.content)
            setShowSaveMessage(true)
          }
        } else {
          const result = await editPromptInEditor(currentPlan())
          if (result.error) {
            addNotification({
              key: 'external-editor-error',
              text: result.error,
              color: 'warning',
              priority: 'high',
            })
          }
          if (
            result.content !== null &&
            result.content !== currentPlan()
          ) {
            setCurrentPlan(result.content)
            setShowSaveMessage(true)
          }
        }
      })()
      return
    }
    if (e.shift && e.key === 'tab') {
      e.preventDefault()
      void handleResponse(
        showClearContext()
          ? 'yes-accept-edits'
          : 'yes-accept-edits-keep-context',
      )
      return
    }
  }

  async function handleResponse(
    value: ResponseValue,
  ): Promise<void> {
    const trimmedFeedback = planFeedback().trim()
    const acceptFeedback = trimmedFeedback || undefined
    const updatedInput =
      isV2() && !planEditedLocally()
        ? {}
        : { plan: currentPlan() }

    if (value === 'no') {
      if (!trimmedFeedback && !hasImages()) {
        return
      }
      logEvent('tengu_plan_exit', {
        planLengthChars: currentPlan().length,
        outcome:
          'no' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
        planStructureVariant: planStructureVariant(),
      })

      let imageBlocks: ImageBlockParam[] | undefined
      if (hasImages()) {
        imageBlocks = await Promise.all(
          imageAttachments().map(async (img) => {
            const block: ImageBlockParam = {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (img.mediaType ||
                  'image/png') as Base64ImageSource['media_type'],
                data: img.content,
              },
            }
            const resized =
              await maybeResizeAndDownsampleImageBlock(block)
            return resized.block
          }),
        )
      }
      props.onDone()
      props.onReject()
      props.toolUseConfirm.onReject(
        trimmedFeedback ||
          (hasImages() ? '(See attached image)' : undefined),
        imageBlocks && imageBlocks.length > 0
          ? imageBlocks
          : undefined,
      )
      return
    }

    if (value !== 'no') {
      autoNameSessionFromPlan(
        currentPlan(),
        setAppState,
        true,
      )
    }

    // Log and handle the selected option
    logEvent('tengu_plan_exit', {
      planLengthChars: currentPlan().length,
      outcome:
        value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      interviewPhaseEnabled: isPlanModeInterviewPhaseEnabled(),
      planStructureVariant: planStructureVariant(),
      hasFeedback: !!acceptFeedback,
    })

    setHasExitedPlanMode(true)
    setNeedsPlanModeExitAttachment(true)
    props.onDone()
    props.toolUseConfirm.onAllow(
      updatedInput,
      buildPermissionUpdates('default', allowedPrompts()),
      acceptFeedback,
    )
  }

  // Simplified UI for empty plans
  if (isEmpty()) {
    return (
      <box flexDirection="column">
        <text>
          <b>Exit plan mode?</b>
        </text>
        <box flexDirection="column" paddingX={1} marginTop={1}>
          <text>Claude wants to exit plan mode</text>
          <box marginTop={1}>
            <text dimmed>
              [Select Yes/No - port Select component separately]
            </text>
          </box>
        </box>
      </box>
    )
  }

  return (
    <box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <box flexDirection="column">
        <text>
          <b>Ready to code?</b>
        </text>
        <box flexDirection="column" marginTop={1}>
          <box paddingX={1} flexDirection="column">
            <text>Here is Claude's plan:</text>
          </box>
          <box
            flexDirection="column"
            paddingX={1}
            marginBottom={1}
            overflow="hidden"
          >
            <text>{currentPlan()}</text>
          </box>
          <box flexDirection="column" paddingX={1}>
            <Show
              when={
                isClassifierPermissionsEnabled() &&
                allowedPrompts() &&
                allowedPrompts()!.length > 0
              }
            >
              <box flexDirection="column" marginBottom={1}>
                <text>
                  <b>Requested permissions:</b>
                </text>
                {/* For each allowed prompt */}
                <text dimmed>
                  {allowedPrompts()
                    ?.map(
                      (p) =>
                        `  · ${p.tool}(${PROMPT_PREFIX} ${p.prompt})`,
                    )
                    .join('\n')}
                </text>
              </box>
            </Show>
            <text dimmed>
              Claude has written up a plan and is ready to execute.
              Would you like to proceed?
            </text>
            <box marginTop={1}>
              <text dimmed>
                [Select options - port Select component separately]
              </text>
            </box>
          </box>
        </box>
      </box>
      <Show when={editorName}>
        <box
          flexDirection="row"
          gap={1}
          paddingX={1}
          marginTop={1}
        >
          <box>
            <text dimmed>ctrl-g to edit in </text>
            <text dimmed>
              <b>{editorName}</b>
            </text>
            <Show when={isV2() && planFilePath()}>
              <text dimmed>
                {' '}
                · {getDisplayPath(planFilePath()!)}
              </text>
            </Show>
          </box>
          <Show when={showSaveMessage()}>
            <box>
              <text dimmed>{' · '}</text>
              <text fg="success">{figures.tick}Plan saved!</text>
            </box>
          </Show>
        </box>
      </Show>
    </box>
  )
}
