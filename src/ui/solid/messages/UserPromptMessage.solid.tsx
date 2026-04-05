import { createMemo } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { getKairosActive, getUserMsgOptIn } from '../../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { useAppState } from '../../../state/AppState.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { logError } from '../../../utils/log.js'
import { countCharInString } from '../../../utils/stringUtils.js'
import { HighlightedThinkingText } from './HighlightedThinkingText.solid.js'

const MAX_DISPLAY_CHARS = 10_000
const TRUNCATE_HEAD_CHARS = 2_500
const TRUNCATE_TAIL_CHARS = 2_500

type Props = {
  addMargin: boolean
  param: TextBlockParam
  isTranscriptMode?: boolean
  timestamp?: string
}

export function UserPromptMessage(props: Props): JSX.Element {
  const text = () => props.param.text

  const isBriefOnly = feature('KAIROS') || feature('KAIROS_BRIEF')
    ? useAppState((s) => s.isBriefOnly)
    : false
  const viewingAgentTaskId = feature('KAIROS') || feature('KAIROS_BRIEF')
    ? useAppState((s) => s.viewingAgentTaskId)
    : null
  const briefEnvEnabled = feature('KAIROS') || feature('KAIROS_BRIEF')
    ? createMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_BRIEF))
    : () => false

  const useBriefLayout = () =>
    feature('KAIROS') || feature('KAIROS_BRIEF')
      ? (getKairosActive() ||
          (getUserMsgOptIn() &&
            (briefEnvEnabled() ||
              getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_brief', false)))) &&
          isBriefOnly &&
          !props.isTranscriptMode &&
          !viewingAgentTaskId
      : false

  // Truncate long display text
  const displayText = createMemo(() => {
    const t = text()
    if (t.length <= MAX_DISPLAY_CHARS) return t
    const head = t.slice(0, TRUNCATE_HEAD_CHARS)
    const tail = t.slice(-TRUNCATE_TAIL_CHARS)
    const hiddenLines =
      countCharInString(t, '\n', TRUNCATE_HEAD_CHARS) - countCharInString(tail, '\n')
    return `${head}\n\u2026 +${hiddenLines} lines \u2026\n${tail}`
  })

  if (!text()) {
    logError(new Error('No content found in user prompt message'))
    return null
  }

  return (
    <box
      flexDirection="column"
      marginTop={props.addMargin ? 1 : 0}
      bg={useBriefLayout() ? undefined : 'userMessageBackground'}
      paddingRight={useBriefLayout() ? 0 : 1}
    >
      <HighlightedThinkingText
        text={displayText()}
        useBriefLayout={useBriefLayout()}
        timestamp={useBriefLayout() ? props.timestamp : undefined}
      />
    </box>
  )
}
