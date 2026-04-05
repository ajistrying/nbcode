import type { JSX } from '@opentui/solid'
import { createSignal } from 'solid-js'
import figures from 'figures'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import TextInput from '../../components/TextInput.js'

type Props = {
  initialLanguage: string | undefined
  onComplete: (language: string | undefined) => void
  onCancel: () => void
}

export function LanguagePicker(props: Props): JSX.Element {
  const [language, setLanguage] = createSignal(props.initialLanguage)
  const [cursorOffset, setCursorOffset] = createSignal(
    (props.initialLanguage ?? '').length,
  )

  useKeybinding('confirm:no', props.onCancel, { context: 'Settings' })

  function handleSubmit(): void {
    const trimmed = language()?.trim()
    props.onComplete(trimmed || undefined)
  }

  return (
    <box flexDirection="column" gap={1}>
      <text>Enter your preferred response and voice language:</text>
      <box flexDirection="row" gap={1}>
        <text>{figures.pointer}</text>
        <TextInput
          value={language() ?? ''}
          onChange={setLanguage}
          onSubmit={handleSubmit}
          focus={true}
          showCursor={true}
          placeholder={`e.g., Japanese, \u65E5\u672C\u8A9E, Espa\u00F1ol${figures.ellipsis}`}
          columns={60}
          cursorOffset={cursorOffset()}
          onChangeCursorOffset={setCursorOffset}
        />
      </box>
      <text dimmed>Leave empty for default (English)</text>
    </box>
  )
}
