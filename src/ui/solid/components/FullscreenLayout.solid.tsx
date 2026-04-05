import figures from 'figures'
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
  Show,
  useContext,
} from 'solid-js'
import { fileURLToPath } from 'url'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import type { ScrollBoxHandle } from '../../../ink/components/ScrollBox.js'
import instances from '../../../ink/instances.js'
import type { Message } from '../../../types/message.js'
import { openBrowser, openPath } from '../../../utils/browser.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { plural } from '../../../utils/stringUtils.js'
import { isNullRenderingAttachment } from '../../../components/messages/nullRenderingAttachments.js'
import type { StickyPrompt } from '../../../components/VirtualMessageList.js'

/** Rows of transcript context kept visible above the modal pane's divider. */
const MODAL_TRANSCRIPT_PEEK = 2

/** Context for scroll-derived chrome (sticky header, pill). */
export const ScrollChromeContext = createContext<{
  setStickyPrompt: (p: StickyPrompt | null) => void
}>({
  setStickyPrompt: () => {},
})

type Props = {
  scrollable: JSX.Element
  bottom: JSX.Element
  overlay?: JSX.Element
  bottomFloat?: JSX.Element
  modal?: JSX.Element
  modalScrollRef?: { current: ScrollBoxHandle | null }
  scrollRef?: { current: ScrollBoxHandle | null }
  dividerYRef?: { current: number | null }
  hidePill?: boolean
  hideSticky?: boolean
  newMessageCount?: number
  onPillClick?: () => void
}

/**
 * Tracks the in-transcript "N new messages" divider position while the
 * user is scrolled up.
 */
export function useUnseenDivider(messageCountAccessor: () => number): {
  dividerIndex: () => number | null
  dividerYRef: { current: number | null }
  onScrollAway: (handle: ScrollBoxHandle) => void
  onRepin: () => void
  jumpToNew: (handle: ScrollBoxHandle | null) => void
  shiftDivider: (indexDelta: number, heightDelta: number) => void
} {
  const [dividerIndex, setDividerIndex] = createSignal<number | null>(
    null,
  )
  let countRef = messageCountAccessor()
  // Keep in sync
  createEffect(() => {
    countRef = messageCountAccessor()
  })

  const dividerYRef: { current: number | null } = { current: null }

  const onRepin = () => {
    setDividerIndex(null)
  }

  const onScrollAway = (handle: ScrollBoxHandle) => {
    const max = Math.max(
      0,
      handle.getScrollHeight() - handle.getViewportHeight(),
    )
    if (handle.getScrollTop() + handle.getPendingDelta() >= max)
      return
    if (dividerYRef.current === null) {
      dividerYRef.current = handle.getScrollHeight()
      setDividerIndex(countRef)
    }
  }

  const jumpToNew = (handle: ScrollBoxHandle | null) => {
    if (!handle) return
    handle.scrollToBottom()
  }

  createEffect(() => {
    const messageCount = messageCountAccessor()
    const idx = dividerIndex()
    if (idx === null) {
      dividerYRef.current = null
    } else if (messageCount < idx) {
      dividerYRef.current = null
      setDividerIndex(null)
    }
  })

  const shiftDivider = (
    indexDelta: number,
    heightDelta: number,
  ) => {
    setDividerIndex((idx) =>
      idx === null ? null : idx + indexDelta,
    )
    if (dividerYRef.current !== null) {
      dividerYRef.current += heightDelta
    }
  }

  return {
    dividerIndex,
    dividerYRef,
    onScrollAway,
    onRepin,
    jumpToNew,
    shiftDivider,
  }
}

/**
 * Counts assistant turns in messages[dividerIndex..end).
 */
export function countUnseenAssistantTurns(
  messages: readonly Message[],
  dividerIndex: number,
): number {
  let count = 0
  let prevWasAssistant = false
  for (let i = dividerIndex; i < messages.length; i++) {
    const m = messages[i]!
    if (m.type === 'progress') continue
    if (m.type === 'assistant' && !assistantHasVisibleText(m)) continue
    const isAssistant = m.type === 'assistant'
    if (isAssistant && !prevWasAssistant) count++
    prevWasAssistant = isAssistant
  }
  return count
}

function assistantHasVisibleText(m: Message): boolean {
  if (m.type !== 'assistant') return false
  for (const b of m.message.content) {
    if (b.type === 'text' && b.text.trim() !== '') return true
  }
  return false
}

export type UnseenDivider = {
  firstUnseenUuid: Message['uuid']
  count: number
}

export function computeUnseenDivider(
  messages: readonly Message[],
  dividerIndex: number | null,
): UnseenDivider | undefined {
  if (dividerIndex === null) return undefined
  let anchorIdx = dividerIndex
  while (
    anchorIdx < messages.length &&
    (messages[anchorIdx]?.type === 'progress' ||
      isNullRenderingAttachment(messages[anchorIdx]!))
  ) {
    anchorIdx++
  }
  const uuid = messages[anchorIdx]?.uuid
  if (!uuid) return undefined
  const count = countUnseenAssistantTurns(messages, dividerIndex)
  return {
    firstUnseenUuid: uuid,
    count: Math.max(1, count),
  }
}

/**
 * Layout wrapper for the REPL. In fullscreen mode, puts scrollable
 * content in a sticky-scroll box and pins bottom content via flexbox.
 */
export function FullscreenLayout(props: Props) {
  const { rows: terminalRows, columns } = useTerminalSize()
  const [stickyPrompt, setStickyPrompt] =
    createSignal<StickyPrompt | null>(null)

  const chromeCtx = { setStickyPrompt }

  const hidePill = () => props.hidePill ?? false
  const hideSticky = () => props.hideSticky ?? false
  const newMessageCount = () => props.newMessageCount ?? 0

  // Hyperlink click handler setup
  onMount(() => {
    if (!isFullscreenEnvEnabled()) return
    const ink = instances.get(process.stdout)
    if (!ink) return
    ink.onHyperlinkClick = (url: string) => {
      if (url.startsWith('file:')) {
        try {
          openPath(fileURLToPath(url))
        } catch {}
      } else {
        openBrowser(url)
      }
    }
    onCleanup(() => {
      ink.onHyperlinkClick = undefined
    })
  })

  if (isFullscreenEnvEnabled()) {
    const sticky = () => (hideSticky() ? null : stickyPrompt())
    const headerPrompt = () => {
      const s = sticky()
      return s != null && s !== 'clicked' && props.overlay == null
        ? s
        : null
    }
    const padCollapsed = () =>
      sticky() != null && props.overlay == null

    return (
      <box flexDirection="column">
        <Show when={headerPrompt()}>
          {(hp) => (
            <NewMessagesPillHeader
              text={hp().text}
              onClick={hp().scrollTo}
            />
          )}
        </Show>
        <box flexGrow={1} flexDirection="column" overflow="hidden">
          <box
            flexGrow={1}
            flexDirection="column"
            paddingTop={padCollapsed() ? 0 : 1}
          >
            <ScrollChromeContext.Provider value={chromeCtx}>
              {props.scrollable}
            </ScrollChromeContext.Provider>
            {props.overlay}
          </box>
          <Show
            when={
              !hidePill() && props.overlay == null
            }
          >
            <NewMessagesPill
              count={newMessageCount()}
              onClick={props.onPillClick}
            />
          </Show>
          <Show when={props.bottomFloat != null}>
            <box position="absolute" bottom={0} right={0}>
              {props.bottomFloat}
            </box>
          </Show>
        </box>
        <box flexDirection="column" flexShrink={0} width="100%">
          <box
            flexDirection="column"
            width="100%"
            flexGrow={1}
            overflowY="hidden"
          >
            {props.bottom}
          </box>
        </box>
        <Show when={props.modal != null}>
          <box
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            flexDirection="column"
            overflow="hidden"
          >
            <box flexShrink={0}>
              <text fg="permission">
                {'\u2594'.repeat(columns)}
              </text>
            </box>
            <box flexDirection="column" paddingX={2} flexShrink={0} overflow="hidden">
              {props.modal}
            </box>
          </box>
        </Show>
      </box>
    )
  }

  // Non-fullscreen: sequential rendering
  return (
    <>
      {props.scrollable}
      {props.bottom}
      {props.overlay}
      {props.modal}
    </>
  )
}

function NewMessagesPill(props: {
  count: number
  onClick?: () => void
}) {
  const [hover, setHover] = createSignal(false)

  const label = () =>
    props.count > 0
      ? `${props.count} new ${plural(props.count, 'message')}`
      : 'Jump to bottom'

  return (
    <box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      justifyContent="center"
    >
      <box
        onClick={props.onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <text dimmed>
          {' '}
          {label()} {figures.arrowDown}{' '}
        </text>
      </box>
    </box>
  )
}

function NewMessagesPillHeader(props: {
  text: string
  onClick?: () => void
}) {
  const [hover, setHover] = createSignal(false)

  return (
    <box
      flexShrink={0}
      width="100%"
      height={1}
      paddingRight={1}
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <text wrap="truncate-end">
        {figures.pointer} {props.text}
      </text>
    </box>
  )
}
