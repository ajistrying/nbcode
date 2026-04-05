import { createEffect } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import { getOriginalCwd } from '../../../../bootstrap/state.js'
import type { CommandResultDisplay } from '../../../../commands.js'
import { Select } from '../../../../components/CustomSelect/select.js'
import type { ToolPermissionContext } from '../../../../Tool.js'
import { useTabHeaderFocus } from '../../../design-system/Tabs.js'

type Props = {
  onExit: (result?: string, options?: { display?: CommandResultDisplay }) => void
  toolPermissionContext: ToolPermissionContext
  onRequestAddDirectory: () => void
  onRequestRemoveDirectory: (path: string) => void
  onHeaderFocusChange?: (focused: boolean) => void
}

type DirectoryItem = {
  path: string
  isCurrent: boolean
  isDeletable: boolean
}

export function WorkspaceTab(props: Props): JSX.Element {
  const { headerFocused, focusHeader } = useTabHeaderFocus()

  // useEffect(fn, [headerFocused, onHeaderFocusChange])
  createEffect(() => {
    props.onHeaderFocusChange?.(headerFocused)
  })

  const additionalDirectories = (): DirectoryItem[] =>
    Array.from(props.toolPermissionContext.additionalWorkingDirectories.keys()).map(
      (path) => ({
        path,
        isCurrent: false,
        isDeletable: true,
      }),
    )

  function handleDirectorySelect(selectedValue: string) {
    if (selectedValue === 'add-directory') {
      props.onRequestAddDirectory()
      return
    }
    const directory = additionalDirectories().find((d) => d.path === selectedValue)
    if (directory && directory.isDeletable) {
      props.onRequestRemoveDirectory(directory.path)
    }
  }

  function handleCancel() {
    props.onExit('Workspace dialog dismissed', { display: 'system' })
  }

  const options = () => {
    const opts = additionalDirectories().map((dir) => ({
      label: dir.path,
      value: dir.path,
    }))
    opts.push({
      label: `Add directory${figures.ellipsis}`,
      value: 'add-directory',
    })
    return opts
  }

  return (
    <box flexDirection="column" marginBottom={1}>
      <box flexDirection="row" marginTop={1} marginLeft={2} gap={1}>
        <text>{`-  ${getOriginalCwd()}`}</text>
        <text dimmed>(Original working directory)</text>
      </box>
      <Select
        options={options()}
        onChange={handleDirectorySelect}
        onCancel={handleCancel}
        visibleOptionCount={Math.min(10, options().length)}
        onUpFromFirstItem={focusHeader}
        isDisabled={headerFocused}
      />
    </box>
  )
}
