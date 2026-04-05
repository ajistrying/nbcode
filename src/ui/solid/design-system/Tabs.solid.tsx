import {
  createSignal,
  createEffect,
  createContext,
  useContext,
  onCleanup,
  type JSX,
} from 'solid-js'
import { Show, For } from 'solid-js/web'
import {
  useIsInsideModal,
  useModalScrollRef,
} from '../../../context/modalContext.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import ScrollBox from '../../../ink/components/ScrollBox.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import type { Theme } from '../../../utils/theme.js'

type TabsProps = {
  children: JSX.Element[]
  title?: string
  color?: keyof Theme
  defaultTab?: string
  hidden?: boolean
  useFullWidth?: boolean
  selectedTab?: string
  onTabChange?: (tabId: string) => void
  banner?: JSX.Element
  disableNavigation?: boolean
  initialHeaderFocused?: boolean
  contentHeight?: number
  navFromContent?: boolean
}

type TabsContextValue = {
  selectedTab: () => string | undefined
  width: () => number | undefined
  headerFocused: () => boolean
  focusHeader: () => void
  blurHeader: () => void
  registerOptIn: () => () => void
}

const TabsContext = createContext<TabsContextValue>({
  selectedTab: () => undefined,
  width: () => undefined,
  headerFocused: () => false,
  focusHeader: () => {},
  blurHeader: () => {},
  registerOptIn: () => () => {},
})

type TabProps = {
  title: string
  id?: string
  children: JSX.Element
}

export function Tabs(props: TabsProps): JSX.Element {
  const initialHeaderFocused = props.initialHeaderFocused ?? true
  const navFromContent = props.navFromContent ?? false

  const { columns: terminalWidth } = useTerminalSize()
  const tabs = () =>
    (props.children as any[]).map((child: any) => [
      child.props?.id ?? child.props?.title,
      child.props?.title,
    ])

  const defaultTabIndex = () => {
    if (!props.defaultTab) return 0
    const idx = tabs().findIndex((tab: string[]) => props.defaultTab === tab[0])
    return idx !== -1 ? idx : 0
  }

  const isControlled = () => props.selectedTab !== undefined
  const [internalSelectedTab, setInternalSelectedTab] = createSignal(defaultTabIndex())

  const controlledTabIndex = () =>
    isControlled()
      ? tabs().findIndex((tab: string[]) => tab[0] === props.selectedTab)
      : -1

  const selectedTabIndex = () =>
    isControlled()
      ? controlledTabIndex() !== -1
        ? controlledTabIndex()
        : 0
      : internalSelectedTab()

  const modalScrollRef = useModalScrollRef()

  const [headerFocused, setHeaderFocused] = createSignal(initialHeaderFocused)
  const focusHeader = () => setHeaderFocused(true)
  const blurHeader = () => setHeaderFocused(false)

  const [optInCount, setOptInCount] = createSignal(0)
  const registerOptIn = () => {
    setOptInCount(n => n + 1)
    return () => setOptInCount(n => n - 1)
  }
  const optedIn = () => optInCount() > 0

  const handleTabChange = (offset: number) => {
    const newIndex = (selectedTabIndex() + tabs().length + offset) % tabs().length
    const newTabId = tabs()[newIndex]?.[0]

    if (isControlled() && props.onTabChange && newTabId) {
      props.onTabChange(newTabId)
    } else {
      setInternalSelectedTab(newIndex)
    }
    setHeaderFocused(true)
  }

  useKeybindings(
    {
      'tabs:next': () => handleTabChange(1),
      'tabs:previous': () => handleTabChange(-1),
    },
    {
      context: 'Tabs',
      isActive: !props.hidden && !props.disableNavigation && headerFocused(),
    },
  )

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!headerFocused() || !optedIn() || props.hidden) return
    if (e.key === 'down') {
      e.preventDefault()
      setHeaderFocused(false)
    }
  }

  useKeybindings(
    {
      'tabs:next': () => {
        handleTabChange(1)
        setHeaderFocused(true)
      },
      'tabs:previous': () => {
        handleTabChange(-1)
        setHeaderFocused(true)
      },
    },
    {
      context: 'Tabs',
      isActive:
        navFromContent &&
        !headerFocused() &&
        optedIn() &&
        !props.hidden &&
        !props.disableNavigation,
    },
  )

  const titleWidth = () => (props.title ? stringWidth(props.title) + 1 : 0)
  const tabsWidth = () =>
    tabs().reduce(
      (sum: number, [, tabTitle]: string[]) =>
        sum + (tabTitle ? stringWidth(tabTitle) : 0) + 2 + 1,
      0,
    )
  const usedWidth = () => titleWidth() + tabsWidth()
  const spacerWidth = () =>
    props.useFullWidth ? Math.max(0, terminalWidth - usedWidth()) : 0

  const contentWidth = () => (props.useFullWidth ? terminalWidth : undefined)

  return (
    <TabsContext.Provider
      value={{
        selectedTab: () => tabs()[selectedTabIndex()]?.[0],
        width: contentWidth,
        headerFocused,
        focusHeader,
        blurHeader,
        registerOptIn,
      }}
    >
      <box
        flexDirection="column"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
        flexShrink={modalScrollRef ? 0 : undefined}
      >
        <Show when={!props.hidden}>
          <box
            flexDirection="row"
            gap={1}
            flexShrink={modalScrollRef ? 0 : undefined}
          >
            <Show when={props.title !== undefined}>
              <text fg={props.color}><b>{props.title}</b></text>
            </Show>
            <For each={tabs()}>
              {(tab, i) => {
                const isCurrent = () => selectedTabIndex() === i()
                const hasColorCursor = () =>
                  props.color && isCurrent() && headerFocused()
                return (
                  <text
                    bg={hasColorCursor() ? props.color : undefined}
                    fg={hasColorCursor() ? 'inverseText' : undefined}
                    inverse={isCurrent() && !hasColorCursor()}
                  >
                    <Show when={isCurrent()}><b> {tab[1]} </b></Show>
                    <Show when={!isCurrent()}> {tab[1]} </Show>
                  </text>
                )
              }}
            </For>
            <Show when={spacerWidth() > 0}>
              <text>{' '.repeat(spacerWidth())}</text>
            </Show>
          </box>
        </Show>
        {props.banner}
        <Show
          when={modalScrollRef}
          fallback={
            <box
              width={contentWidth()}
              marginTop={props.hidden ? 0 : 1}
              height={props.contentHeight}
              overflowY={props.contentHeight !== undefined ? 'hidden' : undefined}
            >
              {props.children}
            </box>
          }
        >
          <box width={contentWidth()} marginTop={props.hidden ? 0 : 1} flexShrink={0}>
            {props.children}
          </box>
        </Show>
      </box>
    </TabsContext.Provider>
  )
}

export function Tab(props: TabProps): JSX.Element {
  const ctx = useContext(TabsContext)
  const insideModal = useIsInsideModal()

  return (
    <Show when={ctx.selectedTab() === (props.id ?? props.title)}>
      <box width={ctx.width()} flexShrink={insideModal ? 0 : undefined}>
        {props.children}
      </box>
    </Show>
  )
}

export function useTabsWidth(): number | undefined {
  const ctx = useContext(TabsContext)
  return ctx.width()
}

/**
 * Opt into header-focus gating. Returns the current header focus state and a
 * callback to hand focus back to the tab row.
 */
export function useTabHeaderFocus(): {
  headerFocused: () => boolean
  focusHeader: () => void
  blurHeader: () => void
} {
  const { headerFocused, focusHeader, blurHeader, registerOptIn } =
    useContext(TabsContext)
  const cleanup = registerOptIn()
  onCleanup(cleanup)
  return { headerFocused, focusHeader, blurHeader }
}
