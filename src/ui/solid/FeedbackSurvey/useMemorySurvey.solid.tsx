import { createEffect, createMemo, onMount } from 'solid-js'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { isAutoMemoryEnabled } from '../../../memdir/paths.js'
import { isPolicyAllowed } from '../../../services/policyLimits/index.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import type { Message } from '../../../types/message.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
} from '../../../utils/config.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { isAutoManagedMemoryFile } from '../../../utils/memoryFileDetection.js'
import {
  extractTextContent,
  getLastAssistantMessage,
} from '../../../utils/messages.js'
import { logOTelEvent } from '../../../utils/telemetry/events.js'
import { submitTranscriptShare } from '../../../components/FeedbackSurvey/submitTranscriptShare.js'
import type { TranscriptShareResponse } from '../../../components/FeedbackSurvey/TranscriptSharePrompt.js'
import {
  isToolCallBlock,
  getToolName,
} from '../../../utils/toolBlockCompat.js'
import { useSurveyState } from './useSurveyState.solid.js'
import type { FeedbackSurveyResponse } from '../../../components/FeedbackSurvey/utils.js'

const HIDE_THANKS_AFTER_MS = 3000
const MEMORY_SURVEY_GATE = 'tengu_dunwich_bell'
const MEMORY_SURVEY_EVENT = 'tengu_memory_survey_event'
const SURVEY_PROBABILITY = 0.2
const TRANSCRIPT_SHARE_TRIGGER = 'memory_survey'
const MEMORY_WORD_RE = /\bmemor(?:y|ies)\b/i

function hasMemoryFileRead(messages: Message[]): boolean {
  for (const message of messages) {
    if (message.type !== 'assistant') {
      continue
    }
    const content = message.message.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const block of content) {
      if (
        !isToolCallBlock(block) ||
        getToolName(block) !== FILE_READ_TOOL_NAME
      ) {
        continue
      }
      const input = block.input as { file_path?: unknown }
      if (
        typeof input.file_path === 'string' &&
        isAutoManagedMemoryFile(input.file_path)
      ) {
        return true
      }
    }
  }
  return false
}

export function useMemorySurvey(
  messagesAccessor: () => Message[],
  isLoadingAccessor: () => boolean,
  hasActivePromptAccessor: () => boolean,
  opts: { enabled?: boolean } = {},
): {
  state: () =>
    | 'closed'
    | 'open'
    | 'thanks'
    | 'transcript_prompt'
    | 'submitting'
    | 'submitted'
  lastResponse: () => FeedbackSurveyResponse | null
  handleSelect: (selected: FeedbackSurveyResponse) => void
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
} {
  const enabled = opts.enabled ?? true

  // Track assistant message UUIDs that were already evaluated so we don't
  // re-roll probability on re-renders or re-scan messages for the same turn.
  let seenAssistantUuids = new Set<string>()
  // Once a memory file read is observed it stays true for the session
  let memoryReadSeen = false
  let messagesRef = messagesAccessor()

  // Keep messagesRef in sync
  createEffect(() => {
    messagesRef = messagesAccessor()
  })

  const onOpen = (appearanceId: string) => {
    logEvent(MEMORY_SURVEY_EVENT, {
      event_type:
        'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'appeared',
      appearance_id: appearanceId,
      survey_type: 'memory',
    })
  }

  const onSelect = (
    appearanceId: string,
    selected: FeedbackSurveyResponse,
  ) => {
    logEvent(MEMORY_SURVEY_EVENT, {
      event_type:
        'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      response:
        selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'responded',
      appearance_id: appearanceId,
      response: selected,
      survey_type: 'memory',
    })
  }

  const shouldShowTranscriptPrompt = (
    selected: FeedbackSurveyResponse,
  ) => {
    if ('external' !== 'ant') {
      return false
    }
    if (selected !== 'bad' && selected !== 'good') {
      return false
    }
    if (getGlobalConfig().transcriptShareDismissed) {
      return false
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return false
    }
    return true
  }

  const onTranscriptPromptShown = (appearanceId: string) => {
    logEvent(MEMORY_SURVEY_EVENT, {
      event_type:
        'transcript_prompt_appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      trigger:
        TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'transcript_prompt_appeared',
      appearance_id: appearanceId,
      survey_type: 'memory',
    })
  }

  const onTranscriptSelect = async (
    appearanceId: string,
    selected: TranscriptShareResponse,
  ): Promise<boolean> => {
    logEvent(MEMORY_SURVEY_EVENT, {
      event_type:
        `transcript_share_${selected}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      trigger:
        TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
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
        TRANSCRIPT_SHARE_TRIGGER,
        appearanceId,
      )
      logEvent(MEMORY_SURVEY_EVENT, {
        event_type: (
          result.success
            ? 'transcript_share_submitted'
            : 'transcript_share_failed'
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        appearance_id:
          appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        trigger:
          TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return result.success
    }
    return false
  }

  const { state, lastResponse, open, handleSelect, handleTranscriptSelect } =
    useSurveyState({
      hideThanksAfterMs: HIDE_THANKS_AFTER_MS,
      onOpen,
      onSelect,
      shouldShowTranscriptPrompt,
      onTranscriptPromptShown,
      onTranscriptSelect,
    })

  const lastAssistant = createMemo(() =>
    getLastAssistantMessage(messagesAccessor()),
  )

  createEffect(() => {
    const messages = messagesAccessor()
    const isLoading = isLoadingAccessor()
    const hasActivePrompt = hasActivePromptAccessor()

    if (!enabled) return

    // /clear resets messages but REPL stays mounted
    if (messages.length === 0) {
      memoryReadSeen = false
      seenAssistantUuids.clear()
      return
    }
    if (state() !== 'closed' || isLoading || hasActivePrompt) {
      return
    }

    if (
      !getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_GATE, false)
    ) {
      return
    }
    if (!isAutoMemoryEnabled()) {
      return
    }
    if (isFeedbackSurveyDisabled()) {
      return
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return
    }
    const la = lastAssistant()
    if (!la || seenAssistantUuids.has(la.uuid)) {
      return
    }
    const text = extractTextContent(la.message.content, ' ')
    if (!MEMORY_WORD_RE.test(text)) {
      return
    }

    seenAssistantUuids.add(la.uuid)
    if (!memoryReadSeen) {
      memoryReadSeen = hasMemoryFileRead(messages)
    }
    if (!memoryReadSeen) {
      return
    }
    if (Math.random() < SURVEY_PROBABILITY) {
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
