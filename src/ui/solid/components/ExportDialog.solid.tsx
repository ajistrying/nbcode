import { join } from 'path'
import { createSignal } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { ExitState } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { setClipboard } from '../../../ink/termio/osc.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getCwd } from '../../../utils/cwd.js'
import { writeFileSync_DEPRECATED } from '../../../utils/slowOperations.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import TextInput from '../../components/TextInput.js'

type ExportDialogProps = {
  content: string
  defaultFilename: string
  onDone: (result: { success: boolean; message: string }) => void
}

type ExportOption = 'clipboard' | 'file'

export function ExportDialog(props: ExportDialogProps): JSX.Element {
  const [, setSelectedOption] = createSignal<ExportOption | null>(null)
  const [filename, setFilename] = createSignal<string>(props.defaultFilename)
  const [cursorOffset, setCursorOffset] = createSignal<number>(props.defaultFilename.length)
  const [showFilenameInput, setShowFilenameInput] = createSignal(false)
  const { columns } = useTerminalSize()

  const handleGoBack = () => {
    setShowFilenameInput(false)
    setSelectedOption(null)
  }

  const handleSelectOption = async (value: string): Promise<void> => {
    if (value === 'clipboard') {
      const raw = await setClipboard(props.content)
      if (raw) process.stdout.write(raw)
      props.onDone({
        success: true,
        message: 'Conversation copied to clipboard',
      })
    } else if (value === 'file') {
      setSelectedOption('file')
      setShowFilenameInput(true)
    }
  }

  const handleFilenameSubmit = () => {
    const finalFilename = filename().endsWith('.txt')
      ? filename()
      : filename().replace(/\.[^.]+$/, '') + '.txt'
    const filepath = join(getCwd(), finalFilename)
    try {
      writeFileSync_DEPRECATED(filepath, props.content, {
        encoding: 'utf-8',
        flush: true,
      })
      props.onDone({
        success: true,
        message: `Conversation exported to: ${filepath}`,
      })
    } catch (error) {
      props.onDone({
        success: false,
        message: `Failed to export conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleCancel = () => {
    if (showFilenameInput()) {
      handleGoBack()
    } else {
      props.onDone({
        success: false,
        message: 'Export cancelled',
      })
    }
  }

  const options = [
    {
      label: 'Copy to clipboard',
      value: 'clipboard',
      description: 'Copy the conversation to your system clipboard',
    },
    {
      label: 'Save to file',
      value: 'file',
      description: 'Save the conversation to a file in the current directory',
    },
  ]

  function renderInputGuide(exitState: ExitState): JSX.Element {
    if (showFilenameInput()) {
      return (
        <Byline>
          <KeyboardShortcutHint shortcut="Enter" action="save" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="go back"
          />
        </Byline>
      )
    }
    if (exitState.pending) {
      return <text>Press {exitState.keyName} again to exit</text>
    }
    return (
      <ConfigurableShortcutHint
        action="confirm:no"
        context="Confirmation"
        fallback="Esc"
        description="cancel"
      />
    )
  }

  useKeybinding('confirm:no', handleCancel, {
    context: 'Settings',
    isActive: showFilenameInput(),
  })

  return (
    <Dialog
      title="Export Conversation"
      subtitle="Select export method:"
      color="permission"
      onCancel={handleCancel}
      inputGuide={renderInputGuide}
      isCancelActive={!showFilenameInput()}
    >
      <Show
        when={!showFilenameInput()}
        fallback={
          <box flexDirection="column">
            <text>Enter filename:</text>
            <box flexDirection="row" gap={1} marginTop={1}>
              <text>&gt;</text>
              <TextInput
                value={filename()}
                onChange={setFilename}
                onSubmit={handleFilenameSubmit}
                focus={true}
                showCursor={true}
                columns={columns}
                cursorOffset={cursorOffset()}
                onChangeCursorOffset={setCursorOffset}
              />
            </box>
          </box>
        }
      >
        <Select
          options={options}
          onChange={handleSelectOption}
          onCancel={handleCancel}
        />
      </Show>
    </Dialog>
  )
}
