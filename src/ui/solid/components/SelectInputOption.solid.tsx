/**
 * SelectInputOption — SolidJS port of src/components/CustomSelect/select-input-option.tsx
 *
 * Renders an input-type option within a Select component, supporting
 * text input, image paste, cursor management, and keybinding integration.
 */
import { createSignal, createEffect, Show, For, type JSX } from 'solid-js'
import type { PastedContent } from '../../../utils/config.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'

type SelectInputOptionProps = {
  option: {
    type: 'input'
    label: any
    value: any
    description?: string
    dimDescription?: boolean
    placeholder?: string
    onChange: (value: string) => void
    showLabelWithValue?: boolean
    labelValueSeparator?: string
    resetCursorOnUpdate?: boolean
  }
  isFocused: boolean
  isSelected: boolean
  shouldShowDownArrow: boolean
  shouldShowUpArrow: boolean
  maxIndexWidth: number
  index: number
  inputValue: string
  onInputChange: (value: string) => void
  onSubmit: (value: string) => void
  onExit?: () => void
  layout: 'compact' | 'expanded'
  children?: JSX.Element
  showLabel?: boolean
  onOpenEditor?: (currentValue: string, setValue: (value: string) => void) => void
  resetCursorOnUpdate?: boolean
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  pastedContents?: Record<number, PastedContent>
  onRemoveImage?: (id: number) => void
  imagesSelected?: boolean
  selectedImageIndex?: number
  onImagesSelectedChange?: (selected: boolean) => void
  onSelectedImageIndexChange?: (index: number) => void
}

export function SelectInputOption(props: SelectInputOptionProps): JSX.Element {
  const showLabelProp = () => props.showLabel ?? false
  const resetCursorOnUpdate = () => props.resetCursorOnUpdate ?? false
  const selectedImageIndex = () => props.selectedImageIndex ?? 0

  const imageAttachments = () => {
    if (!props.pastedContents) return []
    return Object.values(props.pastedContents).filter((c: any) => c.type === 'image')
  }

  const showLabel = () => showLabelProp() || props.option.showLabelWithValue === true

  const [cursorOffset, setCursorOffset] = createSignal(props.inputValue.length)
  let isUserEditing = false

  // Reset cursor on update when option becomes focused or input value changes
  createEffect(() => {
    if (resetCursorOnUpdate() && props.isFocused) {
      if (isUserEditing) {
        isUserEditing = false
      } else {
        setCursorOffset(props.inputValue.length)
      }
    }
  })

  // Reset images selected when focus is lost
  createEffect(() => {
    if (!props.isFocused && props.imagesSelected) {
      props.onImagesSelectedChange?.(false)
    }
  })

  const descriptionPaddingLeft = () =>
    props.layout === 'expanded' ? props.maxIndexWidth + 3 : props.maxIndexWidth + 4

  const indexStr = () => `${props.index}.`.padEnd(props.maxIndexWidth + 2)

  return (
    <box flexDirection="column" flexShrink={0}>
      {/* Main option row */}
      <box flexDirection="row" flexShrink={props.layout === 'compact' ? 0 : undefined}>
        <text dimmed>{indexStr()}</text>
        {props.children}
        <Show when={showLabel()}>
          <text fg={props.isFocused ? 'cyan' : undefined}>{props.option.label}</text>
          <Show when={props.isFocused}>
            <text fg="cyan">{props.option.labelValueSeparator ?? ', '}</text>
            <text>{props.inputValue}</text>
          </Show>
          <Show when={!props.isFocused && props.inputValue}>
            <text>
              {props.option.labelValueSeparator ?? ', '}
              {props.inputValue}
            </text>
          </Show>
        </Show>
        <Show when={!showLabel()}>
          <Show when={props.isFocused}>
            <text>{props.inputValue || props.option.placeholder || props.option.label}</text>
          </Show>
          <Show when={!props.isFocused}>
            <text fg={props.inputValue ? undefined : 'gray'}>
              {props.inputValue || props.option.placeholder || props.option.label}
            </text>
          </Show>
        </Show>
      </box>

      {/* Description */}
      <Show when={props.option.description}>
        <box paddingLeft={descriptionPaddingLeft()}>
          <text
            dimmed={props.option.dimDescription !== false}
            fg={props.isSelected ? 'green' : props.isFocused ? 'cyan' : undefined}
          >
            {props.option.description}
          </text>
        </box>
      </Show>

      {/* Image attachments */}
      <Show when={imageAttachments().length > 0}>
        <box flexDirection="row" gap={1} paddingLeft={descriptionPaddingLeft()}>
          <For each={imageAttachments()}>
            {(img: any, idx) => (
              <text dimmed={!(props.imagesSelected && idx() === selectedImageIndex())}>
                [img:{img.id}]
              </text>
            )}
          </For>
          <text dimmed>
            <Show when={props.imagesSelected}>
              {imageAttachments().length > 1 && '\u2190/\u2192 navigate · '}backspace remove · esc cancel
            </Show>
            <Show when={!props.imagesSelected && props.isFocused}>(\u2193 to select)</Show>
          </text>
        </box>
      </Show>

      {/* Expanded layout spacer */}
      <Show when={props.layout === 'expanded'}>
        <text> </text>
      </Show>
    </box>
  )
}
