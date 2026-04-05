import type { JSX } from '@opentui/solid'
import { createEffect } from 'solid-js'
import chalk from 'chalk'
import { useClipboardImageHint } from '../../../hooks/useClipboardImageHint.js'
import { useVimInput } from '../../../hooks/useVimInput.js'
import { color, useTerminalFocus, useTheme } from '../../../ink.js'
import type { VimTextInputProps } from '../../../types/textInputTypes.js'
import type { TextHighlight } from '../../../utils/textHighlighting.js'
import { BaseTextInput } from '../../components/BaseTextInput.js'

export type Props = VimTextInputProps & {
  highlights?: TextHighlight[]
}

export default function VimTextInput(props: Props): JSX.Element {
  const [theme] = useTheme()
  const isTerminalFocused = useTerminalFocus()

  useClipboardImageHint(isTerminalFocused, !!props.onImagePaste)

  const vimInputState = useVimInput({
    value: props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onExit: props.onExit,
    onExitMessage: props.onExitMessage,
    onHistoryReset: props.onHistoryReset,
    onHistoryUp: props.onHistoryUp,
    onHistoryDown: props.onHistoryDown,
    onClearInput: props.onClearInput,
    focus: props.focus,
    mask: props.mask,
    multiline: props.multiline,
    cursorChar: props.showCursor ? ' ' : '',
    highlightPastedText: props.highlightPastedText,
    invert: isTerminalFocused ? chalk.inverse : (text: string) => text,
    themeText: color('text', theme),
    columns: props.columns,
    maxVisibleLines: props.maxVisibleLines,
    onImagePaste: props.onImagePaste,
    disableCursorMovementForUpDownKeys:
      props.disableCursorMovementForUpDownKeys,
    disableEscapeDoublePress: props.disableEscapeDoublePress,
    externalOffset: props.cursorOffset,
    onOffsetChange: props.onChangeCursorOffset,
    inputFilter: props.inputFilter,
    onModeChange: props.onModeChange,
    onUndo: props.onUndo,
  })

  const { mode, setMode } = vimInputState

  createEffect(() => {
    if (props.initialMode && props.initialMode !== mode) {
      setMode(props.initialMode)
    }
  })

  return (
    <box flexDirection="column">
      <BaseTextInput
        inputState={vimInputState}
        terminalFocus={isTerminalFocused}
        highlights={props.highlights}
        {...props}
      />
    </box>
  )
}
