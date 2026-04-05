/**
 * AddWorkspaceDirectory — SolidJS port of
 * src/components/permissions/rules/AddWorkspaceDirectory.tsx
 *
 * Dialog to add a directory to the workspace, with text input,
 * tab-completion suggestions, and remember/session options.
 */
import figures from 'figures'
import { createSignal, createEffect, Show, type JSX } from 'solid-js'
import { useDebounceCallback } from 'usehooks-ts'
import {
  addDirHelpMessage,
  validateDirectoryForWorkspace,
} from '../../../commands/add-dir/validation.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import { getDirectoryCompletions } from '../../../utils/suggestions/directoryCompletion.js'
import type { SuggestionItem } from '../../components/PromptInput/PromptInputFooterSuggestions.js'

type RememberDirectoryOption = 'yes-session' | 'yes-remember' | 'no'

const REMEMBER_DIRECTORY_OPTIONS: Array<{
  value: RememberDirectoryOption
  label: string
}> = [
  { value: 'yes-session', label: 'Yes, for this session' },
  { value: 'yes-remember', label: 'Yes, and remember this directory' },
  { value: 'no', label: 'No' },
]

function PermissionDescription(): JSX.Element {
  return (
    <text dimmed>
      Claude Code will be able to read files in this directory and make edits when auto-accept
      edits is on.
    </text>
  )
}

function DirectoryDisplay(props: { path: string }): JSX.Element {
  return (
    <box flexDirection="column" paddingX={2} gap={1}>
      <text fg="magenta">{props.path}</text>
      <PermissionDescription />
    </box>
  )
}

function DirectoryInput(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  error: string | null
  suggestions: SuggestionItem[]
  selectedSuggestion: number
}): JSX.Element {
  return (
    <box flexDirection="column">
      <text>Enter the path to the directory:</text>
      <box marginY={1} paddingLeft={1}>
        <text>{props.value || `Directory path${figures.ellipsis}`}</text>
      </box>
      <Show when={props.suggestions.length > 0}>
        <box marginBottom={1}>
          <text dimmed>
            {props.suggestions.map((s, i) => (i === props.selectedSuggestion ? `> ${s.id}` : `  ${s.id}`)).join('\n')}
          </text>
        </box>
      </Show>
      <Show when={props.error}>
        <text fg="red">{props.error}</text>
      </Show>
    </box>
  )
}

type AddWorkspaceDirectoryProps = {
  onAddDirectory: (path: string, remember?: boolean) => void
  onCancel: () => void
  permissionContext: ToolPermissionContext
  directoryPath?: string
}

export function AddWorkspaceDirectory(props: AddWorkspaceDirectoryProps): JSX.Element {
  const [directoryInput, setDirectoryInput] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)
  const [suggestions, setSuggestions] = createSignal<SuggestionItem[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = createSignal(0)

  async function fetchSuggestions(path: string) {
    if (!path) {
      setSuggestions([])
      setSelectedSuggestion(0)
      return
    }
    const completions = await getDirectoryCompletions(path)
    setSuggestions(completions)
    setSelectedSuggestion(0)
  }

  // Debounce suggestions fetch
  createEffect(() => {
    const input = directoryInput()
    const timer = setTimeout(() => fetchSuggestions(input), 100)
    return () => clearTimeout(timer)
  })

  function applySuggestion(suggestion: SuggestionItem) {
    const newPath = suggestion.id + '/'
    setDirectoryInput(newPath)
    setError(null)
  }

  async function handleSubmit(newPath: string) {
    const result = await validateDirectoryForWorkspace(newPath, props.permissionContext)
    if (result.resultType === 'success') {
      props.onAddDirectory(result.absolutePath, false)
    } else {
      setError(addDirHelpMessage(result))
    }
  }

  function handleSelect(value: string) {
    if (!props.directoryPath) return
    const selectionValue = value as RememberDirectoryOption
    switch (selectionValue) {
      case 'yes-session':
        props.onAddDirectory(props.directoryPath!, false)
        break
      case 'yes-remember':
        props.onAddDirectory(props.directoryPath!, true)
        break
      case 'no':
        props.onCancel()
        break
    }
  }

  return (
    <box flexDirection="column" tabIndex={0}>
      <box flexDirection="column">
        <text>
          <b>Add directory to workspace</b>
        </text>

        <Show when={props.directoryPath}>
          <box flexDirection="column" gap={1}>
            <DirectoryDisplay path={props.directoryPath!} />
            {/* Select options for remember */}
            {REMEMBER_DIRECTORY_OPTIONS.map((opt) => (
              <text>
                {opt.label}
              </text>
            ))}
          </box>
        </Show>

        <Show when={!props.directoryPath}>
          <box flexDirection="column" gap={1} marginX={2}>
            <PermissionDescription />
            <DirectoryInput
              value={directoryInput()}
              onChange={setDirectoryInput}
              onSubmit={handleSubmit}
              error={error()}
              suggestions={suggestions()}
              selectedSuggestion={selectedSuggestion()}
            />
          </box>
        </Show>
      </box>

      {/* Footer */}
      <Show when={!props.directoryPath}>
        <text dimmed>Tab to complete · Enter to add · Esc to cancel</text>
      </Show>
    </box>
  )
}
