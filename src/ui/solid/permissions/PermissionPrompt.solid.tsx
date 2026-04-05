import { createMemo, createSignal, Show, type JSX } from 'solid-js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { useSetAppState } from '../../../state/AppState.js'
import type { KeybindingAction } from '../../../keybindings/types.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'

export type FeedbackType = 'accept' | 'reject'

export type PermissionPromptOption<T extends string> = {
  value: T
  label: JSX.Element
  feedbackConfig?: {
    type: FeedbackType
    placeholder?: string
  }
  keybinding?: KeybindingAction
}

export type ToolAnalyticsContext = {
  toolName: string
  isMcp: boolean
}

export type PermissionPromptProps<T extends string> = {
  options: PermissionPromptOption<T>[]
  onSelect: (value: T, feedback?: string) => void
  onCancel?: () => void
  question?: string | JSX.Element
  toolAnalyticsContext?: ToolAnalyticsContext
}

const DEFAULT_PLACEHOLDERS: Record<FeedbackType, string> = {
  accept: 'tell Claude what to do next',
  reject: 'tell Claude what to do differently',
}

/**
 * Shared component for permission prompts with optional feedback input.
 */
export function PermissionPrompt<T extends string>(
  props: PermissionPromptProps<T>,
) {
  const question = () => props.question ?? 'Do you want to proceed?'
  const setAppState = useSetAppState()
  const [acceptFeedback, setAcceptFeedback] = createSignal('')
  const [rejectFeedback, setRejectFeedback] = createSignal('')
  const [acceptInputMode, setAcceptInputMode] = createSignal(false)
  const [rejectInputMode, setRejectInputMode] = createSignal(false)
  const [focusedValue, setFocusedValue] = createSignal<string | null>(
    null,
  )
  const [acceptFeedbackModeEntered, setAcceptFeedbackModeEntered] =
    createSignal(false)
  const [rejectFeedbackModeEntered, setRejectFeedbackModeEntered] =
    createSignal(false)

  const focusedOption = createMemo(() =>
    props.options.find((opt) => opt.value === focusedValue()),
  )

  const focusedFeedbackType = () =>
    focusedOption()?.feedbackConfig?.type

  const showTabHint = () =>
    (focusedFeedbackType() === 'accept' && !acceptInputMode()) ||
    (focusedFeedbackType() === 'reject' && !rejectInputMode())

  const selectOptions = createMemo(() =>
    props.options.map((opt) => {
      const { value, label, feedbackConfig } = opt
      if (!feedbackConfig) {
        return { label, value }
      }
      const { type, placeholder } = feedbackConfig
      const isInputMode =
        type === 'accept' ? acceptInputMode() : rejectInputMode()
      const onChange =
        type === 'accept' ? setAcceptFeedback : setRejectFeedback
      const defaultPlaceholder = DEFAULT_PLACEHOLDERS[type]
      if (isInputMode) {
        return {
          type: 'input' as const,
          label,
          value,
          placeholder: placeholder ?? defaultPlaceholder,
          onChange,
          allowEmptySubmitToCancel: true,
        }
      }
      return { label, value }
    }),
  )

  const handleInputModeToggle = (value: string) => {
    const option = props.options.find((opt) => opt.value === value)
    if (!option?.feedbackConfig) return
    const { type } = option.feedbackConfig
    const analyticsProps = {
      toolName: props.toolAnalyticsContext
        ?.toolName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      isMcp: props.toolAnalyticsContext?.isMcp ?? false,
    }
    if (type === 'accept') {
      if (acceptInputMode()) {
        setAcceptInputMode(false)
        logEvent(
          'tengu_accept_feedback_mode_collapsed',
          analyticsProps,
        )
      } else {
        setAcceptInputMode(true)
        setAcceptFeedbackModeEntered(true)
        logEvent(
          'tengu_accept_feedback_mode_entered',
          analyticsProps,
        )
      }
    } else if (type === 'reject') {
      if (rejectInputMode()) {
        setRejectInputMode(false)
        logEvent(
          'tengu_reject_feedback_mode_collapsed',
          analyticsProps,
        )
      } else {
        setRejectInputMode(true)
        setRejectFeedbackModeEntered(true)
        logEvent(
          'tengu_reject_feedback_mode_entered',
          analyticsProps,
        )
      }
    }
  }

  const handleSelect = (value: T) => {
    const option = props.options.find((opt) => opt.value === value)
    if (!option) return
    let feedback: string | undefined
    if (option.feedbackConfig) {
      const rawFeedback =
        option.feedbackConfig.type === 'accept'
          ? acceptFeedback()
          : rejectFeedback()
      const trimmedFeedback = rawFeedback.trim()
      if (trimmedFeedback) {
        feedback = trimmedFeedback
      }
      const analyticsProps = {
        toolName: props.toolAnalyticsContext
          ?.toolName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        isMcp: props.toolAnalyticsContext?.isMcp ?? false,
        has_instructions: !!trimmedFeedback,
        instructions_length: trimmedFeedback?.length ?? 0,
        entered_feedback_mode:
          option.feedbackConfig.type === 'accept'
            ? acceptFeedbackModeEntered()
            : rejectFeedbackModeEntered(),
      }
      if (option.feedbackConfig.type === 'accept') {
        logEvent('tengu_accept_submitted', analyticsProps)
      } else if (option.feedbackConfig.type === 'reject') {
        logEvent('tengu_reject_submitted', analyticsProps)
      }
    }
    props.onSelect(value, feedback)
  }

  // Build keybinding handlers
  const keybindingHandlers = createMemo(() => {
    const handlers: Record<string, () => void> = {}
    for (const opt of props.options) {
      if (opt.keybinding) {
        handlers[opt.keybinding] = () => handleSelect(opt.value)
      }
    }
    return handlers
  })

  useKeybindings(keybindingHandlers(), { context: 'Confirmation' })

  const handleCancel = () => {
    logEvent('tengu_permission_request_escape', {})
    setAppState((prev) => ({
      ...prev,
      attribution: {
        ...prev.attribution,
        escapeCount: prev.attribution.escapeCount + 1,
      },
    }))
    props.onCancel?.()
  }

  const handleFocus = (value: string) => {
    const newOption = props.options.find(
      (opt) => opt.value === value,
    )
    if (
      newOption?.feedbackConfig?.type !== 'accept' &&
      acceptInputMode() &&
      !acceptFeedback().trim()
    ) {
      setAcceptInputMode(false)
    }
    if (
      newOption?.feedbackConfig?.type !== 'reject' &&
      rejectInputMode() &&
      !rejectFeedback().trim()
    ) {
      setRejectInputMode(false)
    }
    setFocusedValue(value)
  }

  return (
    <box flexDirection="column">
      <Show
        when={typeof question() === 'string'}
        fallback={question()}
      >
        <text>{question() as string}</text>
      </Show>
      {/* Select component would be rendered here */}
      <text dimmed>
        [Select options - port Select component separately]
      </text>
      <box marginTop={1}>
        <text dimmed>
          Esc to cancel
          <Show when={showTabHint()}> · Tab to amend</Show>
        </text>
      </box>
    </box>
  )
}
