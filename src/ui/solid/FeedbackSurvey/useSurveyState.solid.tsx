import { randomUUID } from 'crypto'
import { createSignal } from 'solid-js'
import type { TranscriptShareResponse } from '../../../components/FeedbackSurvey/TranscriptSharePrompt.js'
import type { FeedbackSurveyResponse } from '../../../components/FeedbackSurvey/utils.js'

type SurveyState =
  | 'closed'
  | 'open'
  | 'thanks'
  | 'transcript_prompt'
  | 'submitting'
  | 'submitted'

type UseSurveyStateOptions = {
  hideThanksAfterMs: number
  onOpen: (appearanceId: string) => void | Promise<void>
  onSelect: (
    appearanceId: string,
    selected: FeedbackSurveyResponse,
  ) => void | Promise<void>
  shouldShowTranscriptPrompt?: (selected: FeedbackSurveyResponse) => boolean
  onTranscriptPromptShown?: (
    appearanceId: string,
    surveyResponse: FeedbackSurveyResponse,
  ) => void
  onTranscriptSelect?: (
    appearanceId: string,
    selected: TranscriptShareResponse,
    surveyResponse: FeedbackSurveyResponse | null,
  ) => boolean | Promise<boolean>
}

export function useSurveyState({
  hideThanksAfterMs,
  onOpen,
  onSelect,
  shouldShowTranscriptPrompt,
  onTranscriptPromptShown,
  onTranscriptSelect,
}: UseSurveyStateOptions): {
  state: () => SurveyState
  lastResponse: () => FeedbackSurveyResponse | null
  open: () => void
  handleSelect: (selected: FeedbackSurveyResponse) => boolean
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
} {
  const [state, setState] = createSignal<SurveyState>('closed')
  const [lastResponse, setLastResponse] =
    createSignal<FeedbackSurveyResponse | null>(null)
  let appearanceId = randomUUID()
  let lastResponseRef: FeedbackSurveyResponse | null = null

  const showThanksThenClose = () => {
    setState('thanks')
    setTimeout(
      () => {
        setState('closed')
        setLastResponse(null)
      },
      hideThanksAfterMs,
    )
  }

  const showSubmittedThenClose = () => {
    setState('submitted')
    setTimeout(() => setState('closed'), hideThanksAfterMs)
  }

  const open = () => {
    if (state() !== 'closed') {
      return
    }
    setState('open')
    appearanceId = randomUUID()
    void onOpen(appearanceId)
  }

  const handleSelect = (selected: FeedbackSurveyResponse): boolean => {
    setLastResponse(selected)
    lastResponseRef = selected
    // Always fire the survey response event first
    void onSelect(appearanceId, selected)
    if (selected === 'dismissed') {
      setState('closed')
      setLastResponse(null)
    } else if (shouldShowTranscriptPrompt?.(selected)) {
      setState('transcript_prompt')
      onTranscriptPromptShown?.(appearanceId, selected)
      return true
    } else {
      showThanksThenClose()
    }
    return false
  }

  const handleTranscriptSelect = (selected: TranscriptShareResponse) => {
    switch (selected) {
      case 'yes':
        setState('submitting')
        void (async () => {
          try {
            const success = await onTranscriptSelect?.(
              appearanceId,
              selected,
              lastResponseRef,
            )
            if (success) {
              showSubmittedThenClose()
            } else {
              showThanksThenClose()
            }
          } catch {
            showThanksThenClose()
          }
        })()
        break
      case 'no':
      case 'dont_ask_again':
        void onTranscriptSelect?.(appearanceId, selected, lastResponseRef)
        showThanksThenClose()
        break
    }
  }

  return {
    state,
    lastResponse,
    open,
    handleSelect,
    handleTranscriptSelect,
  }
}
