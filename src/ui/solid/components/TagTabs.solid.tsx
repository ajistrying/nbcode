import type { JSX } from '@opentui/solid'
import { For } from 'solid-js'

type TagTabItem = {
  label: string
  value: string
  count?: number
}

type Props = {
  tabs: TagTabItem[]
  activeTab: string
  onSelect: (value: string) => void
}

export function TagTabs(props: Props): JSX.Element {
  return (
    <box flexDirection="row" gap={1}>
      <For each={props.tabs}>{(tab) => {
        const isActive = () => tab.value === props.activeTab
        return (
          <box>
            <text
              fg={isActive() ? 'suggestion' : undefined}
              dimmed={!isActive()}
            >
              <b>{tab.label}</b>
              {tab.count !== undefined ? ` (${tab.count})` : ''}
            </text>
          </box>
        )
      }}</For>
    </box>
  )
}
