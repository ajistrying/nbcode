import { createSignal, createEffect, type JSX } from 'solid-js'
import { Show, For } from 'solid-js/web'
import { useSearchInput } from '../../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { clamp } from '../../../ink/layout/geometry.js'
import { SearchBox } from '../components/SearchBox.solid.js'
import { Byline } from './Byline.solid.js'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.solid.js'
import { ListItem } from './ListItem.solid.js'
import { Pane } from './Pane.solid.js'

type PickerAction<T> = {
  action: string
  handler: (item: T) => void
}

type Props<T> = {
  title: string
  placeholder?: string
  initialQuery?: string
  items: readonly T[]
  getKey: (item: T) => string
  renderItem: (item: T, isFocused: boolean) => JSX.Element
  renderPreview?: (item: T) => JSX.Element
  previewPosition?: 'bottom' | 'right'
  visibleCount?: number
  direction?: 'down' | 'up'
  onQueryChange: (query: string) => void
  onSelect: (item: T) => void
  onTab?: PickerAction<T>
  onShiftTab?: PickerAction<T>
  onFocus?: (item: T | undefined) => void
  onCancel: () => void
  emptyMessage?: string | ((query: string) => string)
  matchLabel?: string
  selectAction?: string
  extraHints?: JSX.Element
}

const DEFAULT_VISIBLE = 8
const CHROME_ROWS = 10
const MIN_VISIBLE = 2

export function FuzzyPicker<T>(props: Props<T>): JSX.Element {
  const placeholder = props.placeholder ?? 'Type to search…'
  const requestedVisible = props.visibleCount ?? DEFAULT_VISIBLE
  const direction = props.direction ?? 'down'
  const emptyMessage = props.emptyMessage ?? 'No results'
  const selectAction = props.selectAction ?? 'select'

  const isTerminalFocused = true // useTerminalFocus equivalent
  const { rows, columns } = useTerminalSize()
  const [focusedIndex, setFocusedIndex] = createSignal(0)

  const visibleCount = () => Math.max(
    MIN_VISIBLE,
    Math.min(requestedVisible, rows - CHROME_ROWS - (props.matchLabel ? 1 : 0)),
  )

  const compact = () => columns < 120

  const step = (delta: 1 | -1) => {
    setFocusedIndex(i => clamp(i + delta, 0, props.items.length - 1))
  }

  const { query, cursorOffset } = useSearchInput({
    isActive: true,
    onExit: () => {},
    onCancel: props.onCancel,
    initialQuery: props.initialQuery,
    backspaceExitsOnEmpty: false,
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'up' || (e.ctrl && e.key === 'p')) {
      e.preventDefault()
      e.stopImmediatePropagation()
      step(direction === 'up' ? 1 : -1)
      return
    }
    if (e.key === 'down' || (e.ctrl && e.key === 'n')) {
      e.preventDefault()
      e.stopImmediatePropagation()
      step(direction === 'up' ? -1 : 1)
      return
    }
    if (e.key === 'return') {
      e.preventDefault()
      e.stopImmediatePropagation()
      const selected = props.items[focusedIndex()]
      if (selected) props.onSelect(selected)
      return
    }
    if (e.key === 'tab') {
      e.preventDefault()
      e.stopImmediatePropagation()
      const selected = props.items[focusedIndex()]
      if (!selected) return
      const tabAction = e.shift ? (props.onShiftTab ?? props.onTab) : props.onTab
      if (tabAction) {
        tabAction.handler(selected)
      } else {
        props.onSelect(selected)
      }
    }
  }

  // Reset focus on query change
  createEffect(() => {
    // Track query
    void query
    props.onQueryChange(query)
    setFocusedIndex(0)
  })

  // Clamp focus when items change
  createEffect(() => {
    const len = props.items.length
    setFocusedIndex(i => clamp(i, 0, len - 1))
  })

  // Fire onFocus when focused item changes
  createEffect(() => {
    const focused = props.items[focusedIndex()]
    props.onFocus?.(focused)
  })

  const windowStart = () => clamp(
    focusedIndex() - visibleCount() + 1,
    0,
    props.items.length - visibleCount(),
  )
  const visible = () => props.items.slice(windowStart(), windowStart() + visibleCount())

  const emptyText = () =>
    typeof emptyMessage === 'function' ? emptyMessage(query) : emptyMessage

  const searchBox = (
    <SearchBox
      query={query}
      cursorOffset={cursorOffset}
      placeholder={placeholder}
      isFocused
      isTerminalFocused={isTerminalFocused}
    />
  )

  const listBlock = (
    <List
      visible={visible()}
      windowStart={windowStart()}
      visibleCount={visibleCount()}
      total={props.items.length}
      focusedIndex={focusedIndex()}
      direction={direction}
      getKey={props.getKey}
      renderItem={props.renderItem}
      emptyText={emptyText()}
    />
  )

  const inputAbove = direction !== 'up'

  return (
    <Pane color="permission">
      <box
        flexDirection="column"
        gap={1}
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <text fg="permission"><b>{props.title}</b></text>
        <Show when={inputAbove}>{searchBox}</Show>
        <Show
          when={props.renderPreview && (props.previewPosition ?? 'bottom') === 'right'}
          fallback={
            <box flexDirection="column">
              {listBlock}
              <Show when={props.matchLabel}>
                <text dimmed>{props.matchLabel}</text>
              </Show>
              <Show when={props.renderPreview && props.items[focusedIndex()]}>
                <box flexDirection="column" flexGrow={1}>
                  {props.renderPreview!(props.items[focusedIndex()]!)}
                </box>
              </Show>
            </box>
          }
        >
          <box
            flexDirection="row"
            gap={2}
            height={visibleCount() + (props.matchLabel ? 1 : 0)}
          >
            <box flexDirection="column" flexShrink={0}>
              {listBlock}
              <Show when={props.matchLabel}>
                <text dimmed>{props.matchLabel}</text>
              </Show>
            </box>
            <Show
              when={props.items[focusedIndex()]}
              fallback={<box flexGrow={1} />}
            >
              <box flexDirection="column" flexGrow={1}>
                {props.renderPreview!(props.items[focusedIndex()]!)}
              </box>
            </Show>
          </box>
        </Show>
        <Show when={!inputAbove}>{searchBox}</Show>
        <text dimmed>
          <Byline>
            <KeyboardShortcutHint
              shortcut="↑/↓"
              action={compact() ? 'nav' : 'navigate'}
            />
            <KeyboardShortcutHint
              shortcut="Enter"
              action={compact() ? firstWord(selectAction) : selectAction}
            />
            <Show when={props.onTab}>
              <KeyboardShortcutHint shortcut="Tab" action={props.onTab!.action} />
            </Show>
            <Show when={props.onShiftTab && !compact()}>
              <KeyboardShortcutHint
                shortcut="shift+tab"
                action={props.onShiftTab!.action}
              />
            </Show>
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
            {props.extraHints}
          </Byline>
        </text>
      </box>
    </Pane>
  )
}

type ListProps<T> = Pick<
  Props<T>,
  'visibleCount' | 'direction' | 'getKey' | 'renderItem'
> & {
  visible: readonly T[]
  windowStart: number
  total: number
  focusedIndex: number
  emptyText: string
}

function List<T>(props: ListProps<T>): JSX.Element {
  if (props.visible.length === 0) {
    return (
      <box height={props.visibleCount} flexShrink={0}>
        <text dimmed>{props.emptyText}</text>
      </box>
    )
  }

  return (
    <box
      height={props.visibleCount}
      flexShrink={0}
      flexDirection={props.direction === 'up' ? 'column-reverse' : 'column'}
    >
      <For each={props.visible as T[]}>
        {(item, i) => {
          const actualIndex = () => props.windowStart + i()
          const isFocused = () => actualIndex() === props.focusedIndex
          const atLowEdge = () => i() === 0 && props.windowStart > 0
          const atHighEdge = () =>
            i() === props.visible.length - 1 &&
            props.windowStart + props.visibleCount! < props.total
          return (
            <ListItem
              isFocused={isFocused()}
              showScrollUp={props.direction === 'up' ? atHighEdge() : atLowEdge()}
              showScrollDown={props.direction === 'up' ? atLowEdge() : atHighEdge()}
              styled={false}
            >
              {props.renderItem(item, isFocused())}
            </ListItem>
          )
        }}
      </For>
    </box>
  )
}

function firstWord(s: string): string {
  const i = s.indexOf(' ')
  return i === -1 ? s : s.slice(0, i)
}
