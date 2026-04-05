import { createSignal, Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import type { KeyboardEvent } from '../../../../ink/events/keyboard-event.js'
import { useAppState } from '../../../../state/AppState.js'
import type {
  Question,
  QuestionOption,
} from '../../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import type { PastedContent } from '../../../../utils/config.js'
import { getExternalEditor } from '../../../../utils/editor.js'
import { toIDEDisplayName } from '../../../../utils/ide.js'
import type { ImageDimensions } from '../../../../utils/imageResizer.js'
import { editPromptInEditor } from '../../../../utils/promptEditor.js'
import {
  type OptionWithDescription,
  Select,
  SelectMulti,
} from '../../../../components/CustomSelect/index.js'
import { Divider } from '../../../design-system/Divider.js'
import { FilePathLink } from '../../../../components/FilePathLink.js'
import { PermissionRequestTitle } from '../PermissionRequestTitle.solid.js'
import { PreviewQuestionView } from '../../../../components/permissions/AskUserQuestionPermissionRequest/PreviewQuestionView.js'
import { QuestionNavigationBar } from '../../../../components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.js'
import type { QuestionState } from '../../../../components/permissions/AskUserQuestionPermissionRequest/use-multiple-choice-state.js'

type Props = {
  question: Question
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string>
  questionStates: Record<string, QuestionState>
  hideSubmitTab?: boolean
  planFilePath?: string
  pastedContents?: Record<number, PastedContent>
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
  onSubmit: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  onRespondToClaude: () => void
  onFinishPlanInterview: () => void
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  onRemoveImage?: (id: number) => void
}

/**
 * NOTE: >3 hooks in original (useState x3 + feature-gated useAppState).
 */
export function QuestionView(props: Props): JSX.Element {
  const hideSubmitTab = () => props.hideSubmitTab ?? false
  const isInPlanMode = useAppState((s) => s.toolPermissionContext.mode) === 'plan'

  const [isFooterFocused, setIsFooterFocused] = createSignal(false)
  const [footerIndex, setFooterIndex] = createSignal(0)
  const [isOtherFocused, setIsOtherFocused] = createSignal(false)

  const editorName = (() => {
    const editor = getExternalEditor()
    return editor ? toIDEDisplayName(editor) : null
  })()

  function handleFocus(value: string) {
    const isOther = value === '__other__'
    setIsOtherFocused(isOther)
    props.onTextInputFocus(isOther)
  }

  function handleDownFromLastItem() {
    setIsFooterFocused(true)
  }

  function handleUpFromFooter() {
    setIsFooterFocused(false)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isFooterFocused()) return

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
      if (isInPlanMode && footerIndex() === 0) {
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
  }

  const questionText = () => props.question.question
  const questionState = () => props.questionStates[questionText()]

  async function handleOpenEditor(currentValue: string, setValue: (v: string) => void) {
    const result = await editPromptInEditor(currentValue)
    if (result.content !== null && result.content !== currentValue) {
      setValue(result.content)
      props.onUpdateQuestionState(
        questionText(),
        { textInputValue: result.content },
        props.question.multiSelect ?? false,
      )
    }
  }

  const textOptions = () =>
    props.question.options.map((opt) => ({
      type: 'text' as const,
      value: opt.label,
      label: opt.label,
      description: opt.description,
    }))

  const options = () => {
    const otherOption = {
      type: 'input' as const,
      value: '__other__',
      label: 'Other',
      placeholder: props.question.multiSelect ? 'Type something' : 'Type something.',
      initialValue: questionState()?.textInputValue ?? '',
      onChange: (value: string) => {
        props.onUpdateQuestionState(
          questionText(),
          { textInputValue: value },
          props.question.multiSelect ?? false,
        )
      },
    }
    return [...textOptions(), otherOption]
  }

  const hasAnyPreview = () =>
    !props.question.multiSelect && props.question.options.some((opt) => opt.preview)

  // If question has previews, delegate to PreviewQuestionView
  if (hasAnyPreview()) {
    return (
      <PreviewQuestionView
        question={props.question}
        questions={props.questions}
        currentQuestionIndex={props.currentQuestionIndex}
        answers={props.answers}
        questionStates={props.questionStates}
        hideSubmitTab={hideSubmitTab()}
        minContentHeight={props.minContentHeight}
        minContentWidth={props.minContentWidth}
        onUpdateQuestionState={props.onUpdateQuestionState}
        onAnswer={props.onAnswer}
        onTextInputFocus={props.onTextInputFocus}
        onCancel={props.onCancel}
        onTabPrev={props.onTabPrev}
        onTabNext={props.onTabNext}
        onRespondToClaude={props.onRespondToClaude}
        onFinishPlanInterview={props.onFinishPlanInterview}
      />
    )
  }

  return (
    <box flexDirection="column" marginTop={0} tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Show when={isInPlanMode && props.planFilePath}>
        <box flexDirection="column" gap={0}>
          <Divider color="inactive" />
          <text fg="inactive">
            Planning: <FilePathLink filePath={props.planFilePath!} />
          </text>
        </box>
      </Show>
      <box marginTop={-1}>
        <Divider color="inactive" />
      </box>
      <box flexDirection="column" paddingTop={0}>
        <QuestionNavigationBar
          questions={props.questions}
          currentQuestionIndex={props.currentQuestionIndex}
          answers={props.answers}
          hideSubmitTab={hideSubmitTab()}
        />
        <PermissionRequestTitle title={props.question.question} color="text" />
        <box flexDirection="column" minHeight={props.minContentHeight}>
          <box marginTop={1}>
            {props.question.multiSelect ? (
              <SelectMulti
                options={options()}
                defaultValue={
                  questionState()?.selectedValue as string[] | undefined
                }
                onChange={(values: string[]) => {
                  props.onUpdateQuestionState(questionText(), { selectedValue: values }, true)
                  const textInput = values.includes('__other__')
                    ? questionState()?.textInputValue
                    : undefined
                  const finalValues = values
                    .filter((v) => v !== '__other__')
                    .concat(textInput ? [textInput] : [])
                  props.onAnswer(questionText(), finalValues, undefined, false)
                }}
                onFocus={handleFocus}
                onCancel={props.onCancel}
                submitButtonText={
                  props.currentQuestionIndex === props.questions.length - 1
                    ? 'Submit'
                    : 'Next'
                }
                onSubmit={props.onSubmit}
                onDownFromLastItem={handleDownFromLastItem}
                isDisabled={isFooterFocused()}
                onOpenEditor={handleOpenEditor}
                onImagePaste={props.onImagePaste}
                pastedContents={props.pastedContents}
                onRemoveImage={props.onRemoveImage}
              />
            ) : (
              <Select
                options={options()}
                defaultValue={questionState()?.selectedValue as string | undefined}
                onChange={(value: string) => {
                  props.onUpdateQuestionState(questionText(), { selectedValue: value }, false)
                  const textInput =
                    value === '__other__' ? questionState()?.textInputValue : undefined
                  props.onAnswer(questionText(), value, textInput)
                }}
                onFocus={handleFocus}
                onCancel={props.onCancel}
                onDownFromLastItem={handleDownFromLastItem}
                isDisabled={isFooterFocused()}
                layout="compact-vertical"
                onOpenEditor={handleOpenEditor}
                onImagePaste={props.onImagePaste}
                pastedContents={props.pastedContents}
                onRemoveImage={props.onRemoveImage}
              />
            )}
          </box>
          {/* Footer section: "Chat about this" + optional plan interview skip */}
          <box flexDirection="column">
            <Divider color="inactive" />
            <box flexDirection="row" gap={1}>
              {isFooterFocused() && footerIndex() === 0 ? (
                <text fg="suggestion">{figures.pointer}</text>
              ) : (
                <text> </text>
              )}
              <text fg={isFooterFocused() && footerIndex() === 0 ? 'suggestion' : undefined}>
                {options().length + 1}. Chat about this
              </text>
            </box>
            <Show when={isInPlanMode}>
              <box flexDirection="row" gap={1}>
                {isFooterFocused() && footerIndex() === 1 ? (
                  <text fg="suggestion">{figures.pointer}</text>
                ) : (
                  <text> </text>
                )}
                <text fg={isFooterFocused() && footerIndex() === 1 ? 'suggestion' : undefined}>
                  {options().length + 2}. Skip interview and plan immediately
                </text>
              </box>
            </Show>
          </box>
          <box marginTop={1}>
            <text fg="inactive" dimmed>
              Enter to select \u00b7{' '}
              {props.questions.length === 1
                ? <>{figures.arrowUp}/{figures.arrowDown} to navigate</>
                : 'Tab/Arrow keys to navigate'}
              <Show when={isOtherFocused() && editorName}>
                {' '}\u00b7 ctrl+g to edit in {editorName}
              </Show>
              {' '}\u00b7 Esc to cancel
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}
