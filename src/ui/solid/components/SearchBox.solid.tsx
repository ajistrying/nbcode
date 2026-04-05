import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'

type Props = {
  query: string
  placeholder?: string
  isFocused: boolean
  isTerminalFocused: boolean
  prefix?: string
  width?: number | string
  cursorOffset?: number
  borderless?: boolean
}

export function SearchBox(props: Props): JSX.Element {
  const placeholder = () => props.placeholder ?? 'Search\u2026'
  const prefix = () => props.prefix ?? '\u2315'
  const borderless = () => props.borderless ?? false
  const offset = () => props.cursorOffset ?? props.query.length

  return (
    <box
      flexShrink={0}
      borderStyle={borderless() ? undefined : 'round'}
      borderColor={props.isFocused ? 'suggestion' : undefined}
      borderDimColor={!props.isFocused}
      paddingX={borderless() ? 0 : 1}
      width={props.width}
    >
      <text dimmed={!props.isFocused}>
        {prefix()}{' '}
        <Show
          when={props.isFocused}
          fallback={
            props.query
              ? <text>{props.query}</text>
              : <text>{placeholder()}</text>
          }
        >
          <Show
            when={props.query}
            fallback={
              <Show
                when={props.isTerminalFocused}
                fallback={<text dimmed>{placeholder()}</text>}
              >
                <text inverse>{placeholder().charAt(0)}</text>
                <text dimmed>{placeholder().slice(1)}</text>
              </Show>
            }
          >
            <Show
              when={props.isTerminalFocused}
              fallback={<text>{props.query}</text>}
            >
              <text>{props.query.slice(0, offset())}</text>
              <text inverse>
                {offset() < props.query.length ? props.query[offset()] : ' '}
              </text>
              <Show when={offset() < props.query.length}>
                <text>{props.query.slice(offset() + 1)}</text>
              </Show>
            </Show>
          </Show>
        </Show>
      </text>
    </box>
  )
}
