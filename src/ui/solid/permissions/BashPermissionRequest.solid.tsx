import { feature } from 'bun:bundle'
import figures from 'figures'
import { createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import { useAppState } from '../../../state/AppState.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import {
  getFirstWordPrefix,
  getSimpleCommandPrefix,
} from '../../../tools/BashTool/bashPermissions.js'
import { getDestructiveCommandWarning } from '../../../tools/BashTool/destructiveCommandWarning.js'
import { parseSedEditCommand } from '../../../tools/BashTool/sedEditParser.js'
import { shouldUseSandbox } from '../../../tools/BashTool/shouldUseSandbox.js'
import { getCompoundCommandPrefixesStatic } from '../../../utils/bash/prefix.js'
import {
  createPromptRuleContent,
  generateGenericDescription,
  getBashPromptAllowDescriptions,
  isClassifierPermissionsEnabled,
} from '../../../utils/permissions/bashClassifier.js'
import { extractRules } from '../../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import {
  type UnaryEvent,
  usePermissionRequestLogging,
} from '../../../components/permissions/hooks.js'
import type { PermissionRequestProps } from '../../../components/permissions/PermissionRequest.js'
import {
  useShellPermissionFeedback,
} from '../../../components/permissions/useShellPermissionFeedback.js'
import { logUnaryPermissionEvent } from '../../../components/permissions/utils.js'
import { bashToolUseOptions } from '../../../components/permissions/BashPermissionRequest/bashToolUseOptions.js'

export function BashPermissionRequest(props: PermissionRequestProps) {
  const parsed = () => BashTool.inputSchema.parse(props.toolUseConfirm.input)
  const command = () => parsed().command
  const description = () => parsed().description
  const sedInfo = () => parseSedEditCommand(command())

  // If sed edit, delegate (would render SedEditPermissionRequest.solid.tsx)
  if (sedInfo()) {
    return (
      <box flexDirection="column">
        <text dimmed>
          [SedEditPermissionRequest - port separately]
        </text>
      </box>
    )
  }

  return (
    <BashPermissionRequestInner
      {...props}
      command={command()}
      description={description()}
    />
  )
}

function BashPermissionRequestInner(
  props: PermissionRequestProps & {
    command: string
    description?: string
  },
) {
  const toolPermissionContext = useAppState(
    (s) => s.toolPermissionContext,
  )

  const {
    yesInputMode,
    noInputMode,
    yesFeedbackModeEntered,
    noFeedbackModeEntered,
    acceptFeedback,
    rejectFeedback,
    setAcceptFeedback,
    setRejectFeedback,
    focusedOption,
    handleInputModeToggle,
    handleReject,
    handleFocus,
  } = useShellPermissionFeedback({
    toolUseConfirm: props.toolUseConfirm,
    onDone: props.onDone,
    onReject: props.onReject,
    explainerVisible: false,
  })

  const [showPermissionDebug, setShowPermissionDebug] =
    createSignal(false)
  const [classifierDescription, setClassifierDescription] =
    createSignal(props.description || '')
  const [initialClassifierDescriptionEmpty, setInitialClassifierDescriptionEmpty] =
    createSignal(!props.description?.trim())

  // Asynchronously generate a generic description for the classifier
  createEffect(() => {
    if (!isClassifierPermissionsEnabled()) return
    const abortController = new AbortController()
    generateGenericDescription(
      props.command,
      props.description,
      abortController.signal,
    )
      .then((generic) => {
        if (generic && !abortController.signal.aborted) {
          setClassifierDescription(generic)
          setInitialClassifierDescriptionEmpty(false)
        }
      })
      .catch(() => {})
    onCleanup(() => abortController.abort())
  })

  const isCompound = () =>
    props.toolUseConfirm.permissionResult.decisionReason?.type ===
    'subcommandResults'

  const [editablePrefix, setEditablePrefix] = createSignal<
    string | undefined
  >(() => {
    if (isCompound()) {
      const backendBashRules = extractRules(
        'suggestions' in props.toolUseConfirm.permissionResult
          ? props.toolUseConfirm.permissionResult.suggestions
          : undefined,
      ).filter(
        (r) =>
          r.toolName === BashTool.name && r.ruleContent,
      )
      return backendBashRules.length === 1
        ? backendBashRules[0]!.ruleContent
        : undefined
    }
    const two = getSimpleCommandPrefix(props.command)
    if (two) return `${two}:*`
    const one = getFirstWordPrefix(props.command)
    if (one) return `${one}:*`
    return props.command
  })

  let hasUserEditedPrefix = false
  const onEditablePrefixChange = (value: string) => {
    hasUserEditedPrefix = true
    setEditablePrefix(value)
  }

  createEffect(() => {
    if (isCompound()) return
    let cancelled = false
    getCompoundCommandPrefixesStatic(
      props.command,
      (subcmd) =>
        BashTool.isReadOnly({ command: subcmd }),
    )
      .then((prefixes) => {
        if (cancelled || hasUserEditedPrefix) return
        if (prefixes.length > 0) {
          setEditablePrefix(`${prefixes[0]}:*`)
        }
      })
      .catch(() => {})
    onCleanup(() => {
      cancelled = true
    })
  })

  const [classifierWasChecking] = createSignal(
    feature('BASH_CLASSIFIER')
      ? !!props.toolUseConfirm.classifierCheckInProgress
      : false,
  )

  const derived = createMemo(() => {
    const destructiveWarning =
      getFeatureValue_CACHED_MAY_BE_STALE(
        'tengu_destructive_command_warning',
        false,
      )
        ? getDestructiveCommandWarning(props.command)
        : null
    const sandboxingEnabled = SandboxManager.isSandboxingEnabled()
    const isSandboxed =
      sandboxingEnabled &&
      shouldUseSandbox(props.toolUseConfirm.input)
    return { destructiveWarning, sandboxingEnabled, isSandboxed }
  })

  const unaryEvent = createMemo<UnaryEvent>(() => ({
    completion_type: 'tool_use_single',
    language_name: 'none',
  }))

  usePermissionRequestLogging(props.toolUseConfirm, unaryEvent())

  const existingAllowDescriptions = createMemo(() =>
    getBashPromptAllowDescriptions(toolPermissionContext),
  )

  const options = createMemo(() =>
    bashToolUseOptions({
      suggestions:
        props.toolUseConfirm.permissionResult.behavior === 'ask'
          ? props.toolUseConfirm.permissionResult.suggestions
          : undefined,
      decisionReason:
        props.toolUseConfirm.permissionResult.decisionReason,
      onRejectFeedbackChange: setRejectFeedback,
      onAcceptFeedbackChange: setAcceptFeedback,
      onClassifierDescriptionChange: setClassifierDescription,
      classifierDescription: classifierDescription(),
      initialClassifierDescriptionEmpty:
        initialClassifierDescriptionEmpty(),
      existingAllowDescriptions: existingAllowDescriptions(),
      yesInputMode,
      noInputMode,
      editablePrefix: editablePrefix(),
      onEditablePrefixChange,
    }),
  )

  // Toggle permission debug info with keybinding
  const handleToggleDebug = () => {
    setShowPermissionDebug((prev) => !prev)
  }
  useKeybinding('permission:toggleDebug', handleToggleDebug, {
    context: 'Confirmation',
  })

  // Allow Esc to dismiss the checkmark after auto-approval
  const handleDismissCheckmark = () => {
    props.toolUseConfirm.onDismissCheckmark?.()
  }
  useKeybinding('confirm:no', handleDismissCheckmark, {
    context: 'Confirmation',
    isActive: feature('BASH_CLASSIFIER')
      ? !!props.toolUseConfirm.classifierAutoApproved
      : false,
  })

  function onSelect(value: string) {
    let optionIndex: Record<string, number> = {
      yes: 1,
      'yes-apply-suggestions': 2,
      'yes-prefix-edited': 2,
      no: 3,
    }
    if (feature('BASH_CLASSIFIER')) {
      optionIndex = {
        yes: 1,
        'yes-apply-suggestions': 2,
        'yes-prefix-edited': 2,
        'yes-classifier-reviewed': 3,
        no: 4,
      }
    }
    logEvent('tengu_permission_request_option_selected', {
      option_index: optionIndex[value],
      explainer_visible: false,
    })
    const toolNameForAnalytics = sanitizeToolNameForAnalytics(
      props.toolUseConfirm.tool.name,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    if (value === 'yes-prefix-edited') {
      const trimmedPrefix = (editablePrefix() ?? '').trim()
      logUnaryPermissionEvent(
        'tool_use_single',
        props.toolUseConfirm,
        'accept',
      )
      if (!trimmedPrefix) {
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          [],
        )
      } else {
        const prefixUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              {
                toolName: BashTool.name,
                ruleContent: trimmedPrefix,
              },
            ],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ]
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          prefixUpdates,
        )
      }
      props.onDone()
      return
    }

    if (
      feature('BASH_CLASSIFIER') &&
      value === 'yes-classifier-reviewed'
    ) {
      const trimmedDescription = classifierDescription().trim()
      logUnaryPermissionEvent(
        'tool_use_single',
        props.toolUseConfirm,
        'accept',
      )
      if (!trimmedDescription) {
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          [],
        )
      } else {
        const permissionUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              {
                toolName: BashTool.name,
                ruleContent:
                  createPromptRuleContent(trimmedDescription),
              },
            ],
            behavior: 'allow',
            destination: 'session',
          },
        ]
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          permissionUpdates,
        )
      }
      props.onDone()
      return
    }

    switch (value) {
      case 'yes': {
        const trimmedFeedback = acceptFeedback.trim()
        logUnaryPermissionEvent(
          'tool_use_single',
          props.toolUseConfirm,
          'accept',
        )
        logEvent('tengu_accept_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: props.toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: yesFeedbackModeEntered,
        })
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          [],
          trimmedFeedback || undefined,
        )
        props.onDone()
        break
      }
      case 'yes-apply-suggestions': {
        logUnaryPermissionEvent(
          'tool_use_single',
          props.toolUseConfirm,
          'accept',
        )
        const permissionUpdates =
          'suggestions' in props.toolUseConfirm.permissionResult
            ? props.toolUseConfirm.permissionResult.suggestions || []
            : []
        props.toolUseConfirm.onAllow(
          props.toolUseConfirm.input,
          permissionUpdates,
        )
        props.onDone()
        break
      }
      case 'no': {
        const trimmedFeedback = rejectFeedback.trim()
        logEvent('tengu_reject_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: props.toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: noFeedbackModeEntered,
        })
        handleReject(trimmedFeedback || undefined)
        break
      }
    }
  }

  return (
    <box flexDirection="column">
      <text>
        <b>
          {derived().sandboxingEnabled && !derived().isSandboxed
            ? 'Bash command (unsandboxed)'
            : 'Bash command'}
        </b>
      </text>
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <text dimmed>{props.command}</text>
        <Show when={props.description}>
          <text dimmed>{props.toolUseConfirm.description}</text>
        </Show>
      </box>
      <Show
        when={!showPermissionDebug()}
        fallback={
          <text dimmed>[Permission debug info]</text>
        }
      >
        <box flexDirection="column">
          <Show when={derived().destructiveWarning}>
            <box marginBottom={1}>
              <text fg="warning">
                {derived().destructiveWarning}
              </text>
            </box>
          </Show>
          <text dimmed>Do you want to proceed?</text>
          <text dimmed>
            [Select options - port Select component separately]
          </text>
        </box>
        <box justifyContent="space-between" marginTop={1}>
          <text dimmed>
            Esc to cancel
            {(focusedOption === 'yes' && !yesInputMode) ||
            (focusedOption === 'no' && !noInputMode)
              ? ' · Tab to amend'
              : ''}
          </text>
        </box>
      </Show>
    </box>
  )
}
