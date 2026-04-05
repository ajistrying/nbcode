import figures from 'figures'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import {
  useKeybinding,
  useKeybindings,
} from '../../../keybindings/useKeybinding.js'
import { useAppState } from '../../../state/AppState.js'
import type { Question } from '../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { getExternalEditor } from '../../../utils/editor.js'
import { toIDEDisplayName } from '../../../utils/ide.js'
import { editPromptInEditor } from '../../../utils/promptEditor.js'
import type { QuestionState } from '../../../components/permissions/AskUserQuestionPermissionRequest/use-multiple-choice-state.js'

type Props = {
  question: Question
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string>
  questionStates: Record<string, QuestionState>
  hideSubmitTab?: boolean
  minContentHeight?: number
  minContentWidth?: number
  onUpdateQuestionState: (
    questionText: string,
    updates: Partial<QuestionState>,
    isMultiSelect: boolean,
  ) => void
  onAnswer: (
    questionText: string,
    label: string | string[],
    textInput?: string,
    shouldAdvance?: boolean,
  ) => void
  onTextInputFocus: (isInInput: boolean) => void
  onCancel: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  onRespondToClaude: () => void
  onFinishPlanInterview: () => void
}

/**
 * A side-by-side question view for questions with preview content.
 * Displays a vertical option list on the left with a preview panel on the right.
 */
export function PreviewQuestionView(props: Props) {
  const isInPlanMode = () =>
    useAppState((s) => s.toolPermissionContext.mode) === 'plan'
  const [isFooterFocused, setIsFooterFocused] = createSignal(false)
  const [footerIndex, setFooterIndex] = createSignal(0)
  const [isInNotesInput, setIsInNotesInput] = createSignal(false)
  const [cursorOffset, setCursorOffset] = createSignal(0)
  const editor = getExternalEditor()
  const editorName = editor ? toIDEDisplayName(editor) : null

  const questionText = () => props.question.question
  const questionState = () => props.questionStates[questionText()]
  const allOptions = () => props.question.options

  const [focusedIndex, setFocusedIndex] = createSignal(0)

  // Reset focusedIndex when navigating to a different question
  let prevQuestionText = questionText()
  const checkQuestionChange = () => {
    const qt = questionText()
    if (prevQuestionText !== qt) {
      prevQuestionText = qt
      const selected = questionState()?.selectedValue as
        | string
        | undefined
      const idx = selected
        ? allOptions().findIndex((opt) => opt.label === selected)
        : -1
      setFocusedIndex(idx >= 0 ? idx : 0)
    }
  }
  // Call on each render access
  checkQuestionChange()

  const focusedOption = () => allOptions()[focusedIndex()]
  const selectedValue = () =>
    questionState()?.selectedValue as string | undefined
  const notesValue = () => questionState()?.textInputValue || ''

  const handleSelectOption = (index: number) => {
    const option = allOptions()[index]
    if (!option) return
    setFocusedIndex(index)
    props.onUpdateQuestionState(
      questionText(),
      { selectedValue: option.label },
      false,
    )
    props.onAnswer(questionText(), option.label)
  }

  const handleNavigate = (direction: 'up' | 'down' | number) => {
    if (isInNotesInput()) return
    let newIndex: number
    if (typeof direction === 'number') {
      newIndex = direction
    } else if (direction === 'up') {
      newIndex =
        focusedIndex() > 0 ? focusedIndex() - 1 : focusedIndex()
    } else {
      newIndex =
        focusedIndex() < allOptions().length - 1
          ? focusedIndex() + 1
          : focusedIndex()
    }
    if (newIndex >= 0 && newIndex < allOptions().length) {
      setFocusedIndex(newIndex)
    }
  }

  // Handle ctrl+g to open external editor for notes
  useKeybinding(
    'chat:externalEditor',
    async () => {
      const currentValue = questionState()?.textInputValue || ''
      const result = await editPromptInEditor(currentValue)
      if (result.content !== null && result.content !== currentValue) {
        props.onUpdateQuestionState(
          questionText(),
          { textInputValue: result.content },
          false,
        )
      }
    },
    {
      context: 'Chat',
      isActive: isInNotesInput() && !!editor,
    },
  )

  // Handle left/right arrow and tab for question navigation
  useKeybindings(
    {
      'tabs:previous': () => props.onTabPrev?.(),
      'tabs:next': () => props.onTabNext?.(),
    },
    {
      context: 'Tabs',
      isActive: !isInNotesInput() && !isFooterFocused(),
    },
  )

  const handleNotesExit = () => {
    setIsInNotesInput(false)
    props.onTextInputFocus(false)
    if (selectedValue()) {
      props.onAnswer(questionText(), selectedValue()!)
    }
  }

  const handleDownFromPreview = () => {
    setIsFooterFocused(true)
  }

  const handleUpFromFooter = () => {
    setIsFooterFocused(false)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isFooterFocused()) {
      if (e.key === 'up' || (e.ctrl && e.key === 'p')) {
        e.preventDefault()
        if (footerIndex() === 0) {
          handleUpFromFooter()
        } else {
          setFooterIndex(0)
        }
        return
      }
      if (e.key === 'down' || (e.ctrl && e.key === 'n')) {
        e.preventDefault()
        if (isInPlanMode() && footerIndex() === 0) {
          setFooterIndex(1)
        }
        return
      }
      if (e.key === 'return') {
        e.preventDefault()
        if (footerIndex() === 0) {
          props.onRespondToClaude()
        } else {
          props.onFinishPlanInterview()
        }
        return
      }
      if (e.key === 'escape') {
        e.preventDefault()
        props.onCancel()
      }
      return
    }
    if (isInNotesInput()) {
      if (e.key === 'escape') {
        e.preventDefault()
        handleNotesExit()
      }
      return
    }

    if (e.key === 'up' || (e.ctrl && e.key === 'p')) {
      e.preventDefault()
      if (focusedIndex() > 0) {
        handleNavigate('up')
      }
    } else if (e.key === 'down' || (e.ctrl && e.key === 'n')) {
      e.preventDefault()
      if (focusedIndex() === allOptions().length - 1) {
        handleDownFromPreview()
      } else {
        handleNavigate('down')
      }
    } else if (e.key === 'return') {
      e.preventDefault()
      handleSelectOption(focusedIndex())
    } else if (e.key === 'n' && !e.ctrl && !e.meta) {
      e.preventDefault()
      setIsInNotesInput(true)
      props.onTextInputFocus(true)
    } else if (e.key === 'escape') {
      e.preventDefault()
      props.onCancel()
    } else if (
      e.key.length === 1 &&
      e.key >= '1' &&
      e.key <= '9'
    ) {
      e.preventDefault()
      const idx = parseInt(e.key, 10) - 1
      if (idx < allOptions().length) {
        handleNavigate(idx)
      }
    }
  }

  const previewContent = () => focusedOption()?.preview || null

  const LEFT_PANEL_WIDTH = 30
  const GAP = 4
  const { columns } = useTerminalSize()
  const previewMaxWidth = columns - LEFT_PANEL_WIDTH - GAP
  const PREVIEW_OVERHEAD = 11

  const previewMaxLines = createMemo(() =>
    props.minContentHeight
      ? Math.max(1, props.minContentHeight - PREVIEW_OVERHEAD)
      : undefined,
  )

  return (
    <box
      flexDirection="column"
      marginTop={1}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <text fg="inactive">{'─'.repeat(columns)}</text>
      <box flexDirection="column" paddingTop={0}>
        <text fg="text">{props.question.question}</text>

        <box
          flexDirection="column"
          minHeight={props.minContentHeight}
        >
          <box marginTop={1} flexDirection="row" gap={4}>
            {/* Left panel: vertical option list */}
            <box flexDirection="column" width={30}>
              <For each={allOptions()}>
                {(option, index) => {
                  const isFocused = () =>
                    focusedIndex() === index()
                  const isSelected = () =>
                    selectedValue() === option.label
                  return (
                    <box flexDirection="row">
                      <Show
                        when={isFocused()}
                        fallback={<text> </text>}
                      >
                        <text fg="suggestion">
                          {figures.pointer}
                        </text>
                      </Show>
                      <text dimmed> {index() + 1}.</text>
                      <text
                        fg={
                          isSelected()
                            ? 'success'
                            : isFocused()
                              ? 'suggestion'
                              : undefined
                        }
                      >
                        {' '}
                        {option.label}
                      </text>
                      <Show when={isSelected()}>
                        <text fg="success"> {figures.tick}</text>
                      </Show>
                    </box>
                  )
                }}
              </For>
            </box>

            {/* Right panel: preview + notes */}
            <box flexDirection="column" flexGrow={1}>
              <text dimmed>
                {previewContent() || 'No preview available'}
              </text>
              <box marginTop={1} flexDirection="row" gap={1}>
                <text fg="suggestion">Notes:</text>
                <Show
                  when={isInNotesInput()}
                  fallback={
                    <text dimmed>
                      {notesValue() || 'press n to add notes'}
                    </text>
                  }
                >
                  <text dimmed>[text input active]</text>
                </Show>
              </box>
            </box>
          </box>

          {/* Footer section */}
          <box flexDirection="column" marginTop={1}>
            <text fg="inactive">{'─'.repeat(columns)}</text>
            <box flexDirection="row" gap={1}>
              <Show
                when={isFooterFocused() && footerIndex() === 0}
                fallback={<text> </text>}
              >
                <text fg="suggestion">{figures.pointer}</text>
              </Show>
              <text
                fg={
                  isFooterFocused() && footerIndex() === 0
                    ? 'suggestion'
                    : undefined
                }
              >
                Chat about this
              </text>
            </box>
            <Show when={isInPlanMode()}>
              <box flexDirection="row" gap={1}>
                <Show
                  when={
                    isFooterFocused() && footerIndex() === 1
                  }
                  fallback={<text> </text>}
                >
                  <text fg="suggestion">{figures.pointer}</text>
                </Show>
                <text
                  fg={
                    isFooterFocused() && footerIndex() === 1
                      ? 'suggestion'
                      : undefined
                  }
                >
                  Skip interview and plan immediately
                </text>
              </box>
            </Show>
          </box>
          <box marginTop={1}>
            <text fg="inactive" dimmed>
              Enter to select · {figures.arrowUp}/{figures.arrowDown}{' '}
              to navigate · n to add notes
              <Show when={props.questions.length > 1}>
                {' '}
                · Tab to switch questions
              </Show>
              <Show when={isInNotesInput() && editorName}>
                {' '}
                · ctrl+g to edit in {editorName}
              </Show>{' '}
              · Esc to cancel
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}
