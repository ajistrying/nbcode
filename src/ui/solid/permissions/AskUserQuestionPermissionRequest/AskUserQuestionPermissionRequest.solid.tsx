import { createSignal, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { Base64ImageSource, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { useSettings } from '../../../../hooks/useSettings.js'
import { useTerminalSize } from '../../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../../ink/stringWidth.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../../services/analytics/index.js'
import { useAppState } from '../../../../state/AppState.js'
import type { Question } from '../../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { AskUserQuestionTool } from '../../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { type CliHighlight, getCliHighlightPromise } from '../../../../utils/cliHighlight.js'
import type { PastedContent } from '../../../../utils/config.js'
import type { ImageDimensions } from '../../../../utils/imageResizer.js'
import { maybeResizeAndDownsampleImageBlock } from '../../../../utils/imageResizer.js'
import { cacheImagePath, storeImage } from '../../../../utils/imageStore.js'
import { logError } from '../../../../utils/log.js'
import { applyMarkdown } from '../../../../utils/markdown.js'
import { isPlanModeInterviewPhaseEnabled } from '../../../../utils/planModeV2.js'
import { getPlanFilePath } from '../../../../utils/plans.js'
import type { PermissionRequestProps } from '../PermissionRequest.solid.js'
import { QuestionView } from './QuestionView.solid.js'
import { SubmitQuestionsView } from './SubmitQuestionsView.solid.js'
import { useMultipleChoiceState } from '../../../../components/permissions/AskUserQuestionPermissionRequest/use-multiple-choice-state.js'

const MIN_CONTENT_HEIGHT = 12
const MIN_CONTENT_WIDTH = 40
const CONTENT_CHROME_OVERHEAD = 15

/**
 * NOTE: >3 hooks in original (useState x1, useRef x1 plus many useCallback/useMemo).
 * Ported as-is. The useRef becomes a plain variable; useState -> createSignal.
 */
export function AskUserQuestionPermissionRequest(
  props: PermissionRequestProps & { highlight?: CliHighlight | null },
): JSX.Element {
  const settings = useSettings()

  // If syntax highlighting disabled, render without highlight
  if (settings.syntaxHighlightingDisabled) {
    return <AskUserQuestionPermissionRequestBody {...props} highlight={null} />
  }

  // Otherwise, render with suspense for highlight loading
  return <AskUserQuestionPermissionRequestBody {...props} highlight={props.highlight ?? null} />
}

function AskUserQuestionPermissionRequestBody(
  props: PermissionRequestProps & { highlight: CliHighlight | null },
): JSX.Element {
  const { toolUseConfirm, onDone, onReject, highlight } = props

  const result = AskUserQuestionTool.inputSchema.safeParse(toolUseConfirm.input)
  const questions: Question[] = result.success ? result.data.questions || [] : []

  const { rows: terminalRows } = useTerminalSize()

  // Compute layout dimensions
  let maxHeight = 0
  let maxWidth = 0
  const maxAllowedHeight = Math.max(MIN_CONTENT_HEIGHT, terminalRows - CONTENT_CHROME_OVERHEAD)

  for (const q of questions) {
    const hasPreview = q.options.some((opt) => opt.preview)
    if (hasPreview) {
      const maxPreviewContentLines = Math.max(1, maxAllowedHeight - 11)
      let maxPreviewBoxHeight = 0
      for (const opt of q.options) {
        if (opt.preview) {
          const rendered = applyMarkdown(opt.preview, undefined, highlight)
          const previewLines = rendered.split('\n')
          const isTruncated = previewLines.length > maxPreviewContentLines
          const displayedLines = isTruncated ? maxPreviewContentLines : previewLines.length
          maxPreviewBoxHeight = Math.max(
            maxPreviewBoxHeight,
            displayedLines + (isTruncated ? 1 : 0) + 2,
          )
          for (const line of previewLines) {
            maxWidth = Math.max(maxWidth, stringWidth(line))
          }
        }
      }
      const rightPanelHeight = maxPreviewBoxHeight + 2
      const leftPanelHeight = q.options.length + 2
      const sideByHeight = Math.max(leftPanelHeight, rightPanelHeight)
      maxHeight = Math.max(maxHeight, sideByHeight + 7)
    } else {
      maxHeight = Math.max(maxHeight, q.options.length + 3 + 7)
    }
  }

  const globalContentHeight = Math.min(Math.max(maxHeight, MIN_CONTENT_HEIGHT), maxAllowedHeight)
  const globalContentWidth = Math.max(maxWidth, MIN_CONTENT_WIDTH)

  const metadataSource = result.success ? result.data.metadata?.source : undefined

  // useState({}) -> createSignal({})
  const [pastedContentsByQuestion, setPastedContentsByQuestion] = createSignal<
    Record<string, Record<number, PastedContent>>
  >({})

  // useRef(0) -> plain variable
  let nextPasteId = 0

  function onImagePaste(
    questionText: string,
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    _sourcePath?: string,
  ) {
    nextPasteId += 1
    const pasteId = nextPasteId
    const newContent: PastedContent = {
      id: pasteId,
      type: 'image',
      content: base64Image,
      mediaType: mediaType || 'image/png',
      filename: filename || 'Pasted image',
      dimensions,
    }
    cacheImagePath(newContent)
    storeImage(newContent)
    setPastedContentsByQuestion((prev) => ({
      ...prev,
      [questionText]: {
        ...(prev[questionText] ?? {}),
        [pasteId]: newContent,
      },
    }))
  }

  function onRemoveImage(questionText: string, id: number) {
    setPastedContentsByQuestion((prev) => {
      const questionContents = { ...(prev[questionText] ?? {}) }
      delete questionContents[id]
      return { ...prev, [questionText]: questionContents }
    })
  }

  const allImageAttachments = () =>
    Object.values(pastedContentsByQuestion())
      .flatMap((contents) => Object.values(contents))
      .filter((c) => c.type === 'image')

  const toolPermissionContextMode = useAppState((s) => s.toolPermissionContext.mode)
  const isInPlanMode = toolPermissionContextMode === 'plan'
  const planFilePath = isInPlanMode ? getPlanFilePath() : undefined

  const state = useMultipleChoiceState()
  const {
    currentQuestionIndex,
    answers,
    questionStates,
    isInTextInput,
    nextQuestion,
    prevQuestion,
    updateQuestionState,
    setAnswer,
    setTextInputMode,
  } = state

  const currentQuestion = () =>
    currentQuestionIndex < (questions?.length || 0) ? questions?.[currentQuestionIndex] : null
  const isInSubmitView = () => currentQuestionIndex === (questions?.length || 0)

  const allQuestionsAnswered = () =>
    questions?.every((q) => q?.question && !!answers[q.question]) ?? false

  const hideSubmitTab = questions.length === 1 && !questions[0]?.multiSelect

  function handleCancel() {
    if (metadataSource) {
      logEvent('tengu_ask_user_question_rejected', {
        source: metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled: isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }
    onDone()
    onReject()
    toolUseConfirm.onReject()
  }

  async function handleRespondToClaude() {
    const questionsWithAnswers = questions
      .map((q) => {
        const answer = answers[q.question]
        if (answer) return `- "${q.question}"\n  Answer: ${answer}`
        return `- "${q.question}"\n  (No answer provided)`
      })
      .join('\n')

    const feedback = `The user wants to clarify these questions.
    This means they may have additional information, context or questions for you.
    Take their response into account and then reformulate the questions if appropriate.
    Start by asking them what they would like to clarify.

    Questions asked:\n${questionsWithAnswers}`

    if (metadataSource) {
      logEvent('tengu_ask_user_question_respond_to_claude', {
        source: metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled: isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }
    const imageBlocks = await convertImagesToBlocks(allImageAttachments())
    onDone()
    toolUseConfirm.onReject(
      feedback,
      imageBlocks && imageBlocks.length > 0 ? imageBlocks : undefined,
    )
  }

  async function handleFinishPlanInterview() {
    const questionsWithAnswers = questions
      .map((q) => {
        const answer = answers[q.question]
        if (answer) return `- "${q.question}"\n  Answer: ${answer}`
        return `- "${q.question}"\n  (No answer provided)`
      })
      .join('\n')

    const feedback = `The user has indicated they have provided enough answers for the plan interview.
Stop asking clarifying questions and proceed to finish the plan with the information you have.

Questions asked and answers provided:\n${questionsWithAnswers}`

    if (metadataSource) {
      logEvent('tengu_ask_user_question_finish_plan_interview', {
        source: metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled: isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }
    const imageBlocks = await convertImagesToBlocks(allImageAttachments())
    onDone()
    toolUseConfirm.onReject(
      feedback,
      imageBlocks && imageBlocks.length > 0 ? imageBlocks : undefined,
    )
  }

  async function submitAnswers(answersToSubmit: Record<string, string>) {
    if (metadataSource) {
      logEvent('tengu_ask_user_question_accepted', {
        source: metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        answerCount: Object.keys(answersToSubmit).length,
        isInPlanMode,
        interviewPhaseEnabled: isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }
    const annotations: Record<string, { preview?: string; notes?: string }> = {}
    for (const q of questions) {
      const answer = answersToSubmit[q.question]
      const notes = questionStates[q.question]?.textInputValue
      const selectedOption = answer
        ? q.options.find((opt) => opt.label === answer)
        : undefined
      const preview = selectedOption?.preview
      if (preview || notes?.trim()) {
        annotations[q.question] = {
          ...(preview && { preview }),
          ...(notes?.trim() && { notes: notes.trim() }),
        }
      }
    }
    const updatedInput = {
      ...toolUseConfirm.input,
      answers: answersToSubmit,
      ...(Object.keys(annotations).length > 0 && { annotations }),
    }
    const contentBlocks = await convertImagesToBlocks(allImageAttachments())
    onDone()
    toolUseConfirm.onAllow(
      updatedInput,
      [],
      undefined,
      contentBlocks && contentBlocks.length > 0 ? contentBlocks : undefined,
    )
  }

  function handleQuestionAnswer(
    questionText: string,
    label: string | string[],
    textInput?: string,
    shouldAdvance: boolean = true,
  ) {
    let answer: string
    const isMultiSelect = Array.isArray(label)
    if (isMultiSelect) {
      answer = label.join(', ')
    } else {
      if (textInput) {
        const questionImages = Object.values(
          pastedContentsByQuestion()[questionText] ?? {},
        ).filter((c) => c.type === 'image')
        answer = questionImages.length > 0 ? `${textInput} (Image attached)` : textInput
      } else {
        if (label === '__other__') {
          const questionImages = Object.values(
            pastedContentsByQuestion()[questionText] ?? {},
          ).filter((c) => c.type === 'image')
          answer = questionImages.length > 0 ? '(Image attached)' : label
        } else {
          answer = label
        }
      }
    }
    const isSingleQuestion = questions.length === 1
    if (!isMultiSelect && isSingleQuestion && shouldAdvance) {
      const updatedAnswers = { ...answers, [questionText]: answer }
      submitAnswers(updatedAnswers).catch(logError)
      return
    }
    setAnswer(questionText, answer, shouldAdvance)
  }

  function handleFinalResponse(value: string) {
    if (value === 'cancel') {
      handleCancel()
      return
    }
    if (value === 'submit') {
      submitAnswers(answers).catch(logError)
    }
  }

  const maxIndex = hideSubmitTab ? (questions?.length || 1) - 1 : questions?.length || 0

  function handleTabPrev() {
    if (currentQuestionIndex > 0) prevQuestion()
  }

  function handleTabNext() {
    if (currentQuestionIndex < maxIndex) nextQuestion()
  }

  // Render current question view
  const cq = currentQuestion()
  if (cq) {
    return (
      <QuestionView
        question={cq}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        answers={answers}
        questionStates={questionStates}
        hideSubmitTab={hideSubmitTab}
        minContentHeight={globalContentHeight}
        minContentWidth={globalContentWidth}
        planFilePath={planFilePath}
        onUpdateQuestionState={updateQuestionState}
        onAnswer={handleQuestionAnswer}
        onTextInputFocus={setTextInputMode}
        onCancel={handleCancel}
        onSubmit={nextQuestion}
        onTabPrev={handleTabPrev}
        onTabNext={handleTabNext}
        onRespondToClaude={handleRespondToClaude}
        onFinishPlanInterview={handleFinishPlanInterview}
        onImagePaste={(base64, mediaType, filename, dims, path) =>
          onImagePaste(cq.question, base64, mediaType, filename, dims, path)
        }
        pastedContents={pastedContentsByQuestion()[cq.question] ?? {}}
        onRemoveImage={(id) => onRemoveImage(cq.question, id)}
      />
    )
  }

  if (isInSubmitView()) {
    return (
      <SubmitQuestionsView
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        answers={answers}
        allQuestionsAnswered={allQuestionsAnswered()}
        permissionResult={toolUseConfirm.permissionResult}
        minContentHeight={globalContentHeight}
        onFinalResponse={handleFinalResponse}
      />
    )
  }

  return null
}

async function convertImagesToBlocks(
  images: PastedContent[],
): Promise<ImageBlockParam[] | undefined> {
  if (images.length === 0) return undefined
  return Promise.all(
    images.map(async (img) => {
      const block: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mediaType || 'image/png') as Base64ImageSource['media_type'],
          data: img.content,
        },
      }
      const resized = await maybeResizeAndDownsampleImageBlock(block)
      return resized.block
    }),
  )
}
