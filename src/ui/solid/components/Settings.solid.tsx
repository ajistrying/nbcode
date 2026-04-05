import { createSignal, Suspense, type JSX } from 'solid-js'
import { Show, For } from 'solid-js/web'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import {
  useIsInsideModal,
  useModalOrTerminalSize,
} from '../../../context/modalContext.js'
import { Pane } from '../design-system/Pane.solid.js'
import { Tabs, Tab } from '../design-system/Tabs.solid.js'
import { Status, buildDiagnostics } from '../../components/Settings/Status.js'
import { Config } from '../../components/Settings/Config.js'
import { Usage } from '../components/Usage.solid.js'
import type {
  LocalJSXCommandContext,
  CommandResultDisplay,
} from '../../../commands.js'

type Props = {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  context: LocalJSXCommandContext
  defaultTab: 'Status' | 'Config' | 'Usage' | 'Gates'
}

export function Settings(props: Props): JSX.Element {
  const [selectedTab, setSelectedTab] = createSignal<string>(props.defaultTab)
  const [tabsHidden, setTabsHidden] = createSignal(false)
  const [configOwnsEsc, setConfigOwnsEsc] = createSignal(false)
  const [gatesOwnsEsc, setGatesOwnsEsc] = createSignal(false)

  const insideModal = useIsInsideModal()
  const termSize = useTerminalSize()
  const { rows } = useModalOrTerminalSize(termSize)
  const contentHeight = () =>
    insideModal
      ? rows + 1
      : Math.max(15, Math.min(Math.floor(rows * 0.8), 30))

  const [diagnosticsPromise] = createSignal(() =>
    buildDiagnostics().catch(() => []),
  )

  useExitOnCtrlCDWithKeybindings()

  const handleEscape = () => {
    if (tabsHidden()) {
      return
    }
    props.onClose('Status dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive:
      !tabsHidden() &&
      !(selectedTab() === 'Config' && configOwnsEsc()) &&
      !(selectedTab() === 'Gates' && gatesOwnsEsc()),
  })

  return (
    <Pane color="permission">
      <Tabs
        color="permission"
        selectedTab={selectedTab()}
        onTabChange={setSelectedTab}
        hidden={tabsHidden()}
        initialHeaderFocused={props.defaultTab !== 'Config' && props.defaultTab !== 'Gates'}
        contentHeight={tabsHidden() || insideModal ? undefined : contentHeight()}
      >
        <Tab title="Status">
          <Status context={props.context} diagnosticsPromise={diagnosticsPromise()()} />
        </Tab>
        <Tab title="Config">
          <Suspense fallback={null}>
            <Config
              context={props.context}
              onClose={props.onClose}
              setTabsHidden={setTabsHidden}
              onIsSearchModeChange={setConfigOwnsEsc}
              contentHeight={contentHeight()}
            />
          </Suspense>
        </Tab>
        <Tab title="Usage">
          <Usage />
        </Tab>
      </Tabs>
    </Pane>
  )
}
