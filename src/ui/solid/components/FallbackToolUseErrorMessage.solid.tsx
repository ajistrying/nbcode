import type { JSX } from '@opentui/solid'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs'
import { Show } from 'solid-js'
import { stripUnderlineAnsi } from 'src/components/shell/OutputLine.js'
import { extractTag } from 'src/utils/messages.js'
import { removeSandboxViolationTags } from 'src/utils/sandbox/sandbox-ui-utils.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import { countCharInString } from '../../../utils/stringUtils.js'
import { MessageResponse } from './MessageResponse.solid.js'

const MAX_RENDERED_LINES = 10

type Props = {
  result: ToolResultBlockParam['content']
  verbose: boolean
}

export function FallbackToolUseErrorMessage(props: Props): JSX.Element {
  const transcriptShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'ctrl+o',
  )

  const errorText = () => {
    let error: string
    if (typeof props.result !== 'string') {
      error = 'Tool execution failed'
    } else {
      const extractedError = extractTag(props.result, 'tool_use_error') ?? props.result
      const withoutSandboxViolations = removeSandboxViolationTags(extractedError)
      const withoutErrorTags = withoutSandboxViolations.replace(/<\/?error>/g, '')
      const trimmed = withoutErrorTags.trim()
      if (!props.verbose && trimmed.includes('InputValidationError: ')) {
        error = 'Invalid tool parameters'
      } else if (
        trimmed.startsWith('Error: ') ||
        trimmed.startsWith('Cancelled: ')
      ) {
        error = trimmed
      } else {
        error = `Error: ${trimmed}`
      }
    }
    return error
  }

  const plusLines = () =>
    countCharInString(errorText(), '\n') + 1 - MAX_RENDERED_LINES

  const displayError = () =>
    stripUnderlineAnsi(
      props.verbose
        ? errorText()
        : errorText().split('\n').slice(0, MAX_RENDERED_LINES).join('\n'),
    )

  return (
    <MessageResponse>
      <box flexDirection="column">
        <text fg="error">{displayError()}</text>
        <Show when={!props.verbose && plusLines() > 0}>
          <box>
            <text dimmed>
              {'\u2026'} +{plusLines()} {plusLines() === 1 ? 'line' : 'lines'} (
            </text>
            <text dimmed><b>{transcriptShortcut}</b></text>
            <text> </text>
            <text dimmed>to see all)</text>
          </box>
        </Show>
      </box>
    </MessageResponse>
  )
}
