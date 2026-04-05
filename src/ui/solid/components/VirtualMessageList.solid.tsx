import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  type JSXElement,
  type Ref,
} from 'solid-js'
import type { ScrollBoxHandle } from '../../../ink/components/ScrollBox.js'
import type { DOMElement } from '../../../ink/dom.js'
import type { MatchPosition } from '../../../ink/render-to-screen.js'
import type { RenderableMessage } from '../../../types/message.js'
import { logForDebugging } from '../../../utils/debug.js'
import { sleep } from '../../../utils/sleep.js'
import { renderableSearchText } from '../../../utils/transcriptSearch.js'
import {
  isNavigableMessage,
  type MessageActionsNav,
  type MessageActionsState,
  type NavigableMessage,
  stripSystemReminders,
  toolCallOf,
} from '../../../components/messageActions.js'

// Rows of breathing room above the target when we scrollTo.
const HEADROOM = 3

// Fallback extractor
const fallbackLowerCache = new WeakMap<RenderableMessage, string>()
function defaultExtractSearchText(msg: RenderableMessage): string {
  const cached = fallbackLowerCache.get(msg)
  if (cached !== undefined) return cached
  const lowered = renderableSearchText(msg)
  fallbackLowerCache.set(msg, lowered)
  return lowered
}

export type StickyPrompt =
  | { text: string; scrollTo: () => void }
  | 'clicked'

const STICKY_TEXT_CAP = 500

/** Imperative handle for transcript navigation. */
export type JumpHandle = {
  jumpToIndex: (i: number) => void
  setSearchQuery: (q: string) => void
  nextMatch: () => void
  prevMatch: () => void
  setAnchor: () => void
  warmSearchIndex: () => Promise<number>
  disarmSearch: () => void
}

type Props = {
  messages: RenderableMessage[]
  scrollRef: { current: ScrollBoxHandle | null }
  columns: number
  itemKey: (msg: RenderableMessage) => string
  renderItem: (msg: RenderableMessage, index: number) => JSXElement
  onItemClick?: (msg: RenderableMessage) => void
  isItemClickable?: (msg: RenderableMessage) => boolean
  isItemExpanded?: (msg: RenderableMessage) => boolean
  extractSearchText?: (msg: RenderableMessage) => string
  trackStickyPrompt?: boolean
  selectedIndex?: number
  cursorNavRef?: Ref<MessageActionsNav>
  setCursor?: (c: MessageActionsState | null) => void
  jumpRef?: { current: JumpHandle | null }
  onSearchMatchesChange?: (count: number, current: number) => void
  scanElement?: (el: DOMElement) => MatchPosition[]
  setPositions?: (
    state: {
      positions: MatchPosition[]
      rowOffset: number
      currentIdx: number
    } | null,
  ) => void
}

/** Returns the text of a real user prompt, or null for anything else. */
const promptTextCache = new WeakMap<RenderableMessage, string | null>()
function stickyPromptText(msg: RenderableMessage): string | null {
  const cached = promptTextCache.get(msg)
  if (cached !== undefined) return cached
  const result = computeStickyPromptText(msg)
  promptTextCache.set(msg, result)
  return result
}

function computeStickyPromptText(msg: RenderableMessage): string | null {
  let raw: string | null = null
  if (msg.type === 'user') {
    if ((msg as any).isMeta || (msg as any).isVisibleInTranscriptOnly) return null
    const block = (msg as any).message.content[0]
    if (block?.type !== 'text') return null
    raw = block.text
  } else if (
    msg.type === 'attachment' &&
    (msg as any).attachment.type === 'queued_command' &&
    (msg as any).attachment.commandMode !== 'task-notification' &&
    !(msg as any).attachment.isMeta
  ) {
    const p = (msg as any).attachment.prompt
    raw =
      typeof p === 'string'
        ? p
        : p.flatMap((b: any) => (b.type === 'text' ? [b.text] : [])).join('\n')
  }
  if (raw === null) return null
  const t = stripSystemReminders(raw)
  if (t.startsWith('<') || t === '') return null
  return t
}

/**
 * Virtualized message list for fullscreen mode.
 *
 * In SolidJS+OpenTUI, the <scrollbox> handles viewport culling natively,
 * so we don't need the same useVirtualScroll hook. Instead, we render
 * all messages inside a scrollbox and let OpenTUI handle the virtualization.
 */
export function VirtualMessageList(props: Props): JSXElement {
  const [hoveredKey, setHoveredKey] = createSignal<string | null>(null)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [searchMatchIndex, setSearchMatchIndex] = createSignal(0)
  let anchorScrollTop = 0
  let searchTextCache = new WeakMap<RenderableMessage, string>()
  let searchCacheWarmed = false

  const extractSearchText = () => props.extractSearchText ?? defaultExtractSearchText

  // Search matches
  const searchMatches = createMemo((): number[] => {
    const query = searchQuery().toLowerCase()
    if (!query) return []
    const matches: number[] = []
    for (let i = 0; i < props.messages.length; i++) {
      const text = extractSearchText()(props.messages[i]!)
      if (text.includes(query)) {
        matches.push(i)
      }
    }
    return matches
  })

  // Report search matches
  createEffect(() => {
    const matches = searchMatches()
    const idx = searchMatchIndex()
    props.onSearchMatchesChange?.(matches.length, matches.length > 0 ? idx + 1 : 0)
  })

  // Expose JumpHandle
  if (props.jumpRef) {
    props.jumpRef.current = {
      jumpToIndex(i: number) {
        const handle = props.scrollRef.current
        if (!handle) return
        // Approximate scroll position — in a real implementation we'd
        // measure element positions. For now, estimate row index.
        handle.scrollTo(Math.max(0, i - HEADROOM))
      },
      setSearchQuery(q: string) {
        setSearchQuery(q)
        if (q) {
          // Jump to first match
          const matches = searchMatches()
          if (matches.length > 0) {
            setSearchMatchIndex(0)
            this.jumpToIndex(matches[0]!)
          }
        }
      },
      nextMatch() {
        const matches = searchMatches()
        if (matches.length === 0) return
        const next = (searchMatchIndex() + 1) % matches.length
        setSearchMatchIndex(next)
        this.jumpToIndex(matches[next]!)
      },
      prevMatch() {
        const matches = searchMatches()
        if (matches.length === 0) return
        const prev = (searchMatchIndex() - 1 + matches.length) % matches.length
        setSearchMatchIndex(prev)
        this.jumpToIndex(matches[prev]!)
      },
      setAnchor() {
        const handle = props.scrollRef.current
        if (handle) anchorScrollTop = handle.scrollTop
      },
      async warmSearchIndex(): Promise<number> {
        if (searchCacheWarmed) return 0
        const start = performance.now()
        await sleep(0) // Yield for paint
        for (const msg of props.messages) {
          extractSearchText()(msg)
        }
        searchCacheWarmed = true
        return performance.now() - start
      },
      disarmSearch() {
        // Clear visual positions without clearing query
        props.setPositions?.(null)
      },
    }
  }

  // Sticky prompt tracking
  const stickyPrompt = createMemo((): StickyPrompt | null => {
    if (!props.trackStickyPrompt) return null
    // Find the last user prompt that's above the viewport
    const handle = props.scrollRef.current
    if (!handle) return null

    for (let i = props.messages.length - 1; i >= 0; i--) {
      const text = stickyPromptText(props.messages[i]!)
      if (text) {
        const cappedText = text.length > STICKY_TEXT_CAP ? text.slice(0, STICKY_TEXT_CAP) : text
        return {
          text: cappedText,
          scrollTo: () => {
            handle.scrollTo(Math.max(0, i - HEADROOM))
          },
        }
      }
    }
    return null
  })

  return (
    <box flexDirection="column">
      <For each={props.messages}>
        {(msg, i) => {
          const key = () => props.itemKey(msg)
          const isExpanded = () => props.isItemExpanded?.(msg) ?? false
          const isHovered = () => hoveredKey() === key()
          const isClickable = () => props.isItemClickable?.(msg) ?? true
          const isSearchMatch = () => {
            const query = searchQuery().toLowerCase()
            if (!query) return false
            return searchMatches().includes(i())
          }
          const isCurrentMatch = () => {
            const matches = searchMatches()
            return matches.length > 0 && matches[searchMatchIndex()] === i()
          }

          return (
            <box
              flexDirection="column"
              onClick={() => {
                if (isClickable()) props.onItemClick?.(msg)
              }}
              onMouseEnter={() => setHoveredKey(key())}
              onMouseLeave={() => {
                if (hoveredKey() === key()) setHoveredKey(null)
              }}
            >
              {props.renderItem(msg, i())}
            </box>
          )
        }}
      </For>
    </box>
  )
}
