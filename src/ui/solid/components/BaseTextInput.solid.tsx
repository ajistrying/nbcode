import { createEffect } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { renderPlaceholder } from '../../../hooks/renderPlaceholder.js'
import { usePasteHandler } from '../../../hooks/usePasteHandler.js'
import { useDeclaredCursor } from '../../../ink/hooks/use-declared-cursor.js'
import type { BaseInputState, BaseTextInputProps } from '../../../types/textInputTypes.js'
import type { TextHighlight } from '../../../utils/textHighlighting.js'
import { HighlightedInput } from '../../components/PromptInput/ShimmeredInput.js'

type BaseTextInputComponentProps = BaseTextInputProps & {
  inputState: BaseInputState
  children?: JSX.Element
  terminalFocus: boolean
  highlights?: TextHighlight[]
  invert?: (text: string) => string
  hidePlaceholderText?: boolean
}

export function BaseTextInput(props: BaseTextInputComponentProps): JSX.Element {
  const cursorRef = useDeclaredCursor({
    line: props.inputState.cursorLine,
    column: props.inputState.cursorColumn,
    active: Boolean(props.focus && props.showCursor && props.terminalFocus),
  })

  const pasteResult = usePasteHandler({
    onPaste: props.onPaste,
    onInput: (input: string, key: any) => {
      if (pasteResult.isPasting && key.return) {
        return
      }
      props.inputState.onInput(input, key)
    },
    onImagePaste: props.onImagePaste,
  })

  const isPasting = () => pasteResult.isPasting

  createEffect(() => {
    if (props.onIsPastingChange) {
      props.onIsPastingChange(isPasting())
    }
  })

  const placeholderResult = () =>
    renderPlaceholder({
      placeholder: props.placeholder,
      value: props.value,
      showCursor: props.showCursor,
      focus: props.focus,
      terminalFocus: props.terminalFocus,
      invert: props.invert,
      hidePlaceholderText: props.hidePlaceholderText,
    })

  const commandWithoutArgs = () =>
    (props.value && props.value.trim().indexOf(' ') === -1) ||
    (props.value && props.value.endsWith(' '))

  const showArgumentHint = () =>
    Boolean(
      props.argumentHint &&
        props.value &&
        commandWithoutArgs() &&
        props.value.startsWith('/'),
    )

  const cursorFiltered = () =>
    props.showCursor && props.highlights
      ? props.highlights.filter(
          (h: TextHighlight) =>
            h.dimColor || props.cursorOffset < h.start || props.cursorOffset >= h.end,
        )
      : props.highlights

  const filteredHighlights = () => {
    const cf = cursorFiltered()
    const { viewportCharOffset, viewportCharEnd } = props.inputState
    return cf && viewportCharOffset > 0
      ? cf
          .filter(
            (h: TextHighlight) =>
              h.end > viewportCharOffset && h.start < viewportCharEnd,
          )
          .map((h: TextHighlight) => ({
            ...h,
            start: Math.max(0, h.start - viewportCharOffset),
            end: h.end - viewportCharOffset,
          }))
      : cf
  }

  const hasHighlights = () => {
    const fh = filteredHighlights()
    return fh && fh.length > 0
  }

  return (
    <Show
      when={hasHighlights()}
      fallback={
        <box ref={cursorRef}>
          <text wrap="truncate-end" dimmed={props.dimColor}>
            <Show
              when={
                placeholderResult().showPlaceholder && props.placeholderElement
              }
            >
              {props.placeholderElement}
            </Show>
            <Show
              when={
                placeholderResult().showPlaceholder &&
                placeholderResult().renderedPlaceholder &&
                !props.placeholderElement
              }
            >
              {placeholderResult().renderedPlaceholder}
            </Show>
            <Show
              when={!placeholderResult().showPlaceholder}
            >
              {props.inputState.renderedValue}
            </Show>
            <Show when={showArgumentHint()}>
              <text dimmed>
                {props.value?.endsWith(' ') ? '' : ' '}
                {props.argumentHint}
              </text>
            </Show>
            {props.children}
          </text>
        </box>
      }
    >
      <box ref={cursorRef}>
        <HighlightedInput
          text={props.inputState.renderedValue}
          highlights={filteredHighlights()!}
        />
        <Show when={showArgumentHint()}>
          <text dimmed>
            {props.value?.endsWith(' ') ? '' : ' '}
            {props.argumentHint}
          </text>
        </Show>
        {props.children}
      </box>
    </Show>
  )
}
