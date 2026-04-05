import { createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { shouldUseSessionMemoryCompaction } from '../../../services/compact/sessionMemoryCompact.js'
import type { Message } from '../../../types/message.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { isCompactBoundaryMessage } from '../../../utils/messages.js'
import { logOTelEvent } from '../../../utils/telemetry/events.js'
import { useSurveyState } from './useSurveyState.solid.js'
import type { FeedbackSurveyResponse } from '../../../components/FeedbackSurvey/utils.js'

const HIDE_THANKS_AFTER_MS = 3000
const POST_COMPACT_SURVEY_GATE = 'tengu_post_compact_survey'
const SURVEY_PROBABILITY = 0.2 // Show survey 20% of the time after compaction

function hasMessageAfterBoundary(
  messages: Message[],
  boundaryUuid: string,
): boolean {
  const boundaryIndex = messages.findIndex(
    (msg) => msg.uuid === boundaryUuid,
  )
  if (boundaryIndex === -1) {
    return false
  }
  for (let i = boundaryIndex + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (msg && (msg.type === 'user' || msg.type === 'assistant')) {
      return true
    }
  }
  return false
}

function onOpen(appearanceId: string) {
  const smCompactionEnabled = shouldUseSessionMemoryCompaction()
  logEvent('tengu_post_compact_survey_event', {
    event_type:
      'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    appearance_id:
      appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    session_memory_compaction_enabled:
      smCompactionEnabled as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  logOTelEvent('feedback_survey', {
    event_type: 'appeared',
    appearance_id: appearanceId,
    survey_type: 'post_compact',
  })
}

function onSelect(
  appearanceId: string,
  selected: FeedbackSurveyResponse,
) {
  const smCompactionEnabled = shouldUseSessionMemoryCompaction()
  logEvent('tengu_post_compact_survey_event', {
    event_type:
      'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    appearance_id:
      appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    response:
      selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    session_memory_compaction_enabled:
      smCompactionEnabled as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  logOTelEvent('feedback_survey', {
    event_type: 'responded',
    appearance_id: appearanceId,
    response: selected,
    survey_type: 'post_compact',
  })
}

export function usePostCompactSurvey(
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
  handleSelect: (selected: FeedbackSurveyResponse) => boolean
} {
  const enabled = opts.enabled ?? true
  const [gateEnabled, setGateEnabled] = createSignal<boolean | null>(null)
  const seenCompactBoundaries = new Set<string>()
  let pendingCompactBoundaryUuid: string | null = null

  const { state, lastResponse, open, handleSelect } = useSurveyState({
    hideThanksAfterMs: HIDE_THANKS_AFTER_MS,
    onOpen,
    onSelect,
  })

  // Check gate on mount
  onMount(() => {
    if (!enabled) {
      return
    }
    setGateEnabled(
      checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
        POST_COMPACT_SURVEY_GATE,
      ),
    )
  })

  const currentCompactBoundaries = createMemo(
    () =>
      new Set(
        messagesAccessor()
          .filter((msg) => isCompactBoundaryMessage(msg))
          .map((msg) => msg.uuid),
      ),
  )

  createEffect(() => {
    const messages = messagesAccessor()
    const isLoading = isLoadingAccessor()
    const hasActivePrompt = hasActivePromptAccessor()
    const boundaries = currentCompactBoundaries()
    const gate = gateEnabled()

    if (!enabled) {
      return
    }
    if (state() !== 'closed' || isLoading) {
      return
    }
    if (hasActivePrompt) {
      return
    }
    if (gate !== true) {
      return
    }
    if (isFeedbackSurveyDisabled()) {
      return
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return
    }
    if (pendingCompactBoundaryUuid !== null) {
      if (
        hasMessageAfterBoundary(messages, pendingCompactBoundaryUuid)
      ) {
        pendingCompactBoundaryUuid = null
        if (Math.random() < SURVEY_PROBABILITY) {
          open()
        }
        return
      }
    }
    const newBoundaries = Array.from(boundaries).filter(
      (uuid) => !seenCompactBoundaries.has(uuid),
    )
    if (newBoundaries.length > 0) {
      for (const b of boundaries) seenCompactBoundaries.add(b)
      pendingCompactBoundaryUuid =
        newBoundaries[newBoundaries.length - 1]!
    }
  })

  return {
    state,
    lastResponse,
    handleSelect,
  }
}
