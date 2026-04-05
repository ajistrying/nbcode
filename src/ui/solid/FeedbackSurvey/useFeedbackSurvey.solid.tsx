import { createEffect, createMemo } from 'solid-js'
import { createSignal } from 'solid-js'
import { useDynamicConfig } from 'src/hooks/useDynamicConfig.js'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { isPolicyAllowed } from '../../../services/policyLimits/index.js'
import type { Message } from '../../../types/message.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
} from '../../../utils/config.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { getLastAssistantMessage } from '../../../utils/messages.js'
import { getMainLoopModel } from '../../../utils/model/model.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'
import { logOTelEvent } from '../../../utils/telemetry/events.js'
import {
  submitTranscriptShare,
  type TranscriptShareTrigger,
} from '../../../components/FeedbackSurvey/submitTranscriptShare.js'
import type { TranscriptShareResponse } from '../../../components/FeedbackSurvey/TranscriptSharePrompt.js'
import { useSurveyState } from './useSurveyState.solid.js'
import type {
  FeedbackSurveyResponse,
  FeedbackSurveyType,
} from '../../../components/FeedbackSurvey/utils.js'

type FeedbackSurveyConfig = {
  minTimeBeforeFeedbackMs: number
  minTimeBetweenFeedbackMs: number
  minTimeBetweenGlobalFeedbackMs: number
  minUserTurnsBeforeFeedback: number
  minUserTurnsBetweenFeedback: number
  hideThanksAfterMs: number
  onForModels: string[]
  probability: number
}

type TranscriptAskConfig = {
  probability: number
}

const DEFAULT_FEEDBACK_SURVEY_CONFIG: FeedbackSurveyConfig = {
  minTimeBeforeFeedbackMs: 600000,
  minTimeBetweenFeedbackMs: 3600000,
  minTimeBetweenGlobalFeedbackMs: 100000000,
  minUserTurnsBeforeFeedback: 5,
  minUserTurnsBetweenFeedback: 10,
  hideThanksAfterMs: 3000,
  onForModels: ['*'],
  probability: 0.005,
}

const DEFAULT_TRANSCRIPT_ASK_CONFIG: TranscriptAskConfig = {
  probability: 0,
}

export function useFeedbackSurvey(
  messagesAccessor: () => Message[],
  isLoadingAccessor: () => boolean,
  submitCountAccessor: () => number,
  surveyType: FeedbackSurveyType = 'session',
  hasActivePromptAccessor: () => boolean = () => false,
): {
  state: () =>
    | 'closed'
    | 'open'
    | 'thanks'
    | 'transcript_prompt'
    | 'submitting'
    | 'submitted'
  lastResponse: () => FeedbackSurveyResponse | null
  handleSelect: (selected: FeedbackSurveyResponse) => boolean
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
} {
  let lastAssistantMessageIdRef = 'unknown'
  // Keep in sync
  createEffect(() => {
    lastAssistantMessageIdRef =
      getLastAssistantMessage(messagesAccessor())?.message?.id || 'unknown'
  })

  const [feedbackSurvey, setFeedbackSurvey] = createSignal<{
    timeLastShown: number | null
    submitCountAtLastAppearance: number | null
  }>({
    timeLastShown: null,
    submitCountAtLastAppearance: null,
  })

  const config = useDynamicConfig<FeedbackSurveyConfig>(
    'tengu_feedback_survey_config',
    DEFAULT_FEEDBACK_SURVEY_CONFIG,
  )
  const badTranscriptAskConfig = useDynamicConfig<TranscriptAskConfig>(
    'tengu_bad_survey_transcript_ask_config',
    DEFAULT_TRANSCRIPT_ASK_CONFIG,
  )
  const goodTranscriptAskConfig = useDynamicConfig<TranscriptAskConfig>(
    'tengu_good_survey_transcript_ask_config',
    DEFAULT_TRANSCRIPT_ASK_CONFIG,
  )
  const settingsRate = getInitialSettings().feedbackSurveyRate
  const sessionStartTime = Date.now()
  const submitCountAtSessionStart = submitCountAccessor()
  let submitCountRef = submitCountAccessor()
  let messagesRef = messagesAccessor()

  // Keep refs in sync
  createEffect(() => {
    submitCountRef = submitCountAccessor()
  })
  createEffect(() => {
    messagesRef = messagesAccessor()
  })

  // Probability gate
  let probabilityPassedRef = false
  let lastEligibleSubmitCountRef: number | null = null

  const updateLastShownTime = (
    timestamp: number,
    submitCountValue: number,
  ) => {
    setFeedbackSurvey((prev) => {
      if (
        prev.timeLastShown === timestamp &&
        prev.submitCountAtLastAppearance === submitCountValue
      ) {
        return prev
      }
      return {
        timeLastShown: timestamp,
        submitCountAtLastAppearance: submitCountValue,
      }
    })
    if (
      getGlobalConfig().feedbackSurveyState?.lastShownTime !== timestamp
    ) {
      saveGlobalConfig((current) => ({
        ...current,
        feedbackSurveyState: {
          lastShownTime: timestamp,
        },
      }))
    }
  }

  const onOpen = (appearanceId: string) => {
    updateLastShownTime(Date.now(), submitCountRef)
    logEvent('tengu_feedback_survey_event', {
      event_type:
        'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_assistant_message_id:
        lastAssistantMessageIdRef as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      survey_type:
        surveyType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'appeared',
      appearance_id: appearanceId,
      survey_type: surveyType,
    })
  }

  const onSelect = (
    appearanceId: string,
    selected: FeedbackSurveyResponse,
  ) => {
    updateLastShownTime(Date.now(), submitCountRef)
    logEvent('tengu_feedback_survey_event', {
      event_type:
        'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      response:
        selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_assistant_message_id:
        lastAssistantMessageIdRef as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      survey_type:
        surveyType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'responded',
      appearance_id: appearanceId,
      response: selected,
      survey_type: surveyType,
    })
  }

  const shouldShowTranscriptPrompt = (
    selected: FeedbackSurveyResponse,
  ) => {
    if (selected !== 'bad' && selected !== 'good') {
      return false
    }
    if (getGlobalConfig().transcriptShareDismissed) {
      return false
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return false
    }
    const probability =
      selected === 'bad'
        ? badTranscriptAskConfig.probability
        : goodTranscriptAskConfig.probability
    return Math.random() <= probability
  }

  const onTranscriptPromptShown = (
    appearanceId: string,
    surveyResponse: FeedbackSurveyResponse,
  ) => {
    const trigger: TranscriptShareTrigger =
      surveyResponse === 'good'
        ? 'good_feedback_survey'
        : 'bad_feedback_survey'
    logEvent('tengu_feedback_survey_event', {
      event_type:
        'transcript_prompt_appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_assistant_message_id:
        lastAssistantMessageIdRef as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      survey_type:
        surveyType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      trigger:
        trigger as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'transcript_prompt_appeared',
      appearance_id: appearanceId,
      survey_type: surveyType,
    })
  }

  const onTranscriptSelect = async (
    appearanceId: string,
    selected: TranscriptShareResponse,
    surveyResponse: FeedbackSurveyResponse | null,
  ): Promise<boolean> => {
    const trigger: TranscriptShareTrigger =
      surveyResponse === 'good'
        ? 'good_feedback_survey'
        : 'bad_feedback_survey'
    logEvent('tengu_feedback_survey_event', {
      event_type:
        `transcript_share_${selected}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_assistant_message_id:
        lastAssistantMessageIdRef as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      survey_type:
        surveyType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      trigger:
        trigger as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    if (selected === 'dont_ask_again') {
      saveGlobalConfig((current) => ({
        ...current,
        transcriptShareDismissed: true,
      }))
    }
    if (selected === 'yes') {
      const result = await submitTranscriptShare(
        messagesRef,
        trigger,
        appearanceId,
      )
      logEvent('tengu_feedback_survey_event', {
        event_type: (
          result.success
            ? 'transcript_share_submitted'
            : 'transcript_share_failed'
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        appearance_id:
          appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        trigger:
          trigger as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return result.success
    }
    return false
  }

  const { state, lastResponse, open, handleSelect, handleTranscriptSelect } =
    useSurveyState({
      hideThanksAfterMs: config.hideThanksAfterMs,
      onOpen,
      onSelect,
      shouldShowTranscriptPrompt,
      onTranscriptPromptShown,
      onTranscriptSelect,
    })

  const currentModel = getMainLoopModel()
  const isModelAllowed = createMemo(() => {
    if (config.onForModels.length === 0) {
      return false
    }
    if (config.onForModels.includes('*')) {
      return true
    }
    return config.onForModels.includes(currentModel)
  })

  const shouldOpen = createMemo(() => {
    const submitCount = submitCountAccessor()
    const isLoading = isLoadingAccessor()
    const hasActivePrompt = hasActivePromptAccessor()
    const fs = feedbackSurvey()

    if (state() !== 'closed') {
      return false
    }
    if (isLoading) {
      return false
    }
    if (hasActivePrompt) {
      return false
    }
    if (
      process.env.CLAUDE_FORCE_DISPLAY_SURVEY &&
      !fs.timeLastShown
    ) {
      return true
    }
    if (!isModelAllowed()) {
      return false
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return false
    }
    if (isFeedbackSurveyDisabled()) {
      return false
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return false
    }

    if (fs.timeLastShown) {
      const timeSinceLastShown = Date.now() - fs.timeLastShown
      if (timeSinceLastShown < config.minTimeBetweenFeedbackMs) {
        return false
      }
      if (
        fs.submitCountAtLastAppearance !== null &&
        submitCount <
          fs.submitCountAtLastAppearance +
            config.minUserTurnsBetweenFeedback
      ) {
        return false
      }
    } else {
      const timeSinceSessionStart = Date.now() - sessionStartTime
      if (timeSinceSessionStart < config.minTimeBeforeFeedbackMs) {
        return false
      }
      if (
        submitCount <
        submitCountAtSessionStart + config.minUserTurnsBeforeFeedback
      ) {
        return false
      }
    }

    if (lastEligibleSubmitCountRef !== submitCount) {
      lastEligibleSubmitCountRef = submitCount
      probabilityPassedRef =
        Math.random() <= (settingsRate ?? config.probability)
    }
    if (!probabilityPassedRef) {
      return false
    }

    const globalFeedbackState = getGlobalConfig().feedbackSurveyState
    if (globalFeedbackState?.lastShownTime) {
      const timeSinceGlobalLastShown =
        Date.now() - globalFeedbackState.lastShownTime
      if (
        timeSinceGlobalLastShown <
        config.minTimeBetweenGlobalFeedbackMs
      ) {
        return false
      }
    }
    return true
  })

  createEffect(() => {
    if (shouldOpen()) {
      open()
    }
  })

  return {
    state,
    lastResponse,
    handleSelect,
    handleTranscriptSelect,
  }
}
