import type { JSX } from '@opentui/solid'
import { For, Show } from 'solid-js'
import figures from 'figures'
import type { ContextSuggestion } from '../../../utils/contextSuggestions.js'
import { formatTokens } from '../../../utils/format.js'
import { StatusIcon } from '../../components/design-system/StatusIcon.js'

type Props = {
  suggestions: ContextSuggestion[]
}

export function ContextSuggestions(props: Props): JSX.Element {
  return (
    <Show when={props.suggestions.length > 0}>
      <box flexDirection="column" marginTop={1}>
        <text><b>Suggestions</b></text>
        <For each={props.suggestions}>{(suggestion, i) => (
          <box flexDirection="column" marginTop={i() === 0 ? 0 : 1}>
            <box>
              <StatusIcon status={suggestion.severity} withSpace />
              <text><b>{suggestion.title}</b></text>
              <Show when={suggestion.savingsTokens}>
                <text dimmed>
                  {' '}
                  {figures.arrowRight} save ~
                  {formatTokens(suggestion.savingsTokens!)}
                </text>
              </Show>
            </box>
            <box marginLeft={2}>
              <text dimmed>{suggestion.detail}</text>
            </box>
          </box>
        )}</For>
      </box>
    </Show>
  ) as JSX.Element
}
