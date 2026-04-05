import type { JSX } from '@opentui/solid'
import { createMemo, Show } from 'solid-js'
import { type Command, formatDescriptionWithSource } from '../../../commands.js'
import { truncate } from '../../../utils/format.js'
import { Select } from '../../components/CustomSelect/select.js'
import { useTabHeaderFocus } from '../../components/design-system/Tabs.js'

type Props = {
  commands: Command[]
  maxHeight: number
  columns: number
  title: string
  onCancel: () => void
  emptyMessage?: string
}

export function Commands(props: Props): JSX.Element {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const maxWidth = () => Math.max(1, props.columns - 10)
  const visibleCount = () => Math.max(1, Math.floor((props.maxHeight - 10) / 2))

  const options = createMemo(() => {
    const seen = new Set<string>()
    return props.commands
      .filter(cmd => {
        if (seen.has(cmd.name)) return false
        seen.add(cmd.name)
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cmd => ({
        label: `/${cmd.name}`,
        value: cmd.name,
        description: truncate(formatDescriptionWithSource(cmd), maxWidth(), true),
      }))
  })

  return (
    <box flexDirection="column" paddingY={1}>
      <Show
        when={props.commands.length > 0 || !props.emptyMessage}
        fallback={<text dimmed>{props.emptyMessage}</text>}
      >
        <text>{props.title}</text>
        <box marginTop={1}>
          <Select
            options={options()}
            visibleOptionCount={visibleCount()}
            onCancel={props.onCancel}
            disableSelection
            hideIndexes
            layout="compact-vertical"
            onUpFromFirstItem={focusHeader}
            isDisabled={headerFocused}
          />
        </box>
      </Show>
    </box>
  )
}
