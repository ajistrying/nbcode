/**
 * Select — SolidJS port of src/components/CustomSelect/select.tsx
 *
 * Renders a selectable list of options with support for text input options,
 * two-column layout, highlight text, image pasting, and keyboard navigation.
 */
import figures from 'figures'
import { createSignal, createEffect, createMemo, Show, For, type JSX } from 'solid-js'
import type { PastedContent } from '../../../utils/config.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'

// Re-export types
export type { OptionWithDescription, SelectProps } from '../../../components/CustomSelect/select.js'

type BaseOption<T> = {
  description?: string
  dimDescription?: boolean
  label: any
  value: T
  disabled?: boolean
}

type OptionWithDescription<T = string> =
  | (BaseOption<T> & { type?: 'text' })
  | (BaseOption<T> & {
      type: 'input'
      onChange: (value: string) => void
      placeholder?: string
      initialValue?: string
      allowEmptySubmitToCancel?: boolean
      showLabelWithValue?: boolean
      labelValueSeparator?: string
      resetCursorOnUpdate?: boolean
    })

type SelectProps<T> = {
  readonly isDisabled?: boolean
  readonly disableSelection?: boolean
  readonly hideIndexes?: boolean
  readonly visibleOptionCount?: number
  readonly highlightText?: string
  readonly options: OptionWithDescription<T>[]
  readonly defaultValue?: T
  readonly onCancel?: () => void
  readonly onChange?: (value: T) => void
  readonly onFocus?: (value: T) => void
  readonly defaultFocusValue?: T
  readonly layout?: 'compact' | 'expanded' | 'compact-vertical'
  readonly inlineDescriptions?: boolean
  readonly onUpFromFirstItem?: () => void
  readonly onDownFromLastItem?: () => void
  readonly onInputModeToggle?: (value: T) => void
  readonly onOpenEditor?: (currentValue: string, setValue: (value: string) => void) => void
  readonly onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  readonly pastedContents?: Record<number, PastedContent>
  readonly onRemoveImage?: (id: number) => void
}

// Extract text content from any node for width calculation
function getTextContent(node: any): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  return ''
}

export function Select<T = string>(props: SelectProps<T>): JSX.Element {
  const isDisabled = () => props.isDisabled ?? false
  const hideIndexes = () => props.hideIndexes ?? false
  const visibleOptionCount = () => props.visibleOptionCount ?? 5
  const layout = () => props.layout ?? 'compact'
  const inlineDescriptions = () => props.inlineDescriptions ?? false

  const [imagesSelected, setImagesSelected] = createSignal(false)
  const [selectedImageIndex, setSelectedImageIndex] = createSignal(0)
  const [focusedIndex, setFocusedIndex] = createSignal(0)
  const [selectedValue, setSelectedValue] = createSignal<T | undefined>(props.defaultValue)

  // Initialize focused index from defaultFocusValue
  createEffect(() => {
    if (props.defaultFocusValue !== undefined) {
      const idx = props.options.findIndex((o) => o.value === props.defaultFocusValue)
      if (idx >= 0) setFocusedIndex(idx)
    }
  })

  // Input values for input-type options
  const [inputValues, setInputValues] = createSignal<Map<any, string>>(() => {
    const m = new Map<any, string>()
    props.options.forEach((opt) => {
      if (opt.type === 'input' && (opt as any).initialValue) {
        m.set(opt.value, (opt as any).initialValue)
      }
    })
    return m
  })

  // Sync initialValues when they change externally
  createEffect(() => {
    for (const option of props.options) {
      if (option.type === 'input' && (option as any).initialValue !== undefined) {
        const newInitial = (option as any).initialValue
        const current = (inputValues() as any).get?.(option.value) ?? ''
        if (current === '' || current === newInitial) {
          setInputValues((prev: any) => {
            const next = new Map(prev)
            next.set(option.value, newInitial)
            return next
          })
        }
      }
    }
  })

  // Visible window
  const visibleFrom = createMemo(() => {
    const count = visibleOptionCount()
    const idx = focusedIndex()
    const total = props.options.length
    if (total <= count) return 0
    const half = Math.floor(count / 2)
    const start = Math.max(0, Math.min(idx - half, total - count))
    return start
  })

  const visibleTo = createMemo(() =>
    Math.min(visibleFrom() + visibleOptionCount(), props.options.length),
  )

  const visibleOptions = createMemo(() => props.options.slice(visibleFrom(), visibleTo()))

  const maxIndexWidth = createMemo(() =>
    hideIndexes() ? 0 : props.options.length.toString().length,
  )

  const focusedValue = createMemo(() => props.options[focusedIndex()]?.value)

  // Render a single option label with optional highlighting
  function renderLabel(option: OptionWithDescription<T>) {
    const label = option.label
    if (
      typeof label === 'string' &&
      props.highlightText &&
      label.includes(props.highlightText)
    ) {
      const idx = label.indexOf(props.highlightText)
      return (
        <text>
          {label.slice(0, idx)}
          <b>{props.highlightText}</b>
          {label.slice(idx + props.highlightText.length)}
        </text>
      )
    }
    return label
  }

  function optionColor(isFocused: boolean, isSelected: boolean, isOptionDisabled: boolean) {
    if (isOptionDisabled) return undefined
    if (isSelected) return 'green'
    if (isFocused) return 'cyan'
    return undefined
  }

  return (
    <box flexDirection="column">
      <For each={visibleOptions()}>
        {(option, localIdx) => {
          const globalIdx = () => visibleFrom() + localIdx()
          const i = () => globalIdx() + 1
          const isFocused = () => !isDisabled() && focusedValue() === option.value
          const isSelected = () => selectedValue() === option.value
          const isOptionDisabled = () => option.disabled === true
          const isFirst = () => option === props.options[visibleFrom()]
          const isLast = () => option === props.options[visibleTo() - 1]
          const moreBelow = () => visibleTo() < props.options.length
          const moreAbove = () => visibleFrom() > 0

          // Pointer / arrow indicator
          const indicator = () => {
            if (isFocused()) return <text fg="cyan">{figures.pointer}</text>
            if (moreBelow() && isLast()) return <text dimmed>{figures.arrowDown}</text>
            if (moreAbove() && isFirst()) return <text dimmed>{figures.arrowUp}</text>
            return <text> </text>
          }

          if (option.type === 'input') {
            const inputValue = () =>
              (inputValues() as any).get?.(option.value) ?? (option as any).initialValue ?? ''
            return (
              <box flexDirection="column" flexShrink={0}>
                <box flexDirection="row">
                  {indicator()}
                  <text> </text>
                  <Show when={!hideIndexes()}>
                    <text dimmed>{`${i()}.`.padEnd(maxIndexWidth() + 2)}</text>
                  </Show>
                  <text fg={optionColor(isFocused(), isSelected(), false)}>
                    {isFocused()
                      ? inputValue() || (option as any).placeholder || option.label
                      : inputValue() || (option as any).placeholder || option.label}
                  </text>
                </box>
                <Show when={option.description}>
                  <box paddingLeft={hideIndexes() ? 4 : maxIndexWidth() + 4}>
                    <text
                      dimmed={option.dimDescription !== false}
                      fg={optionColor(isFocused(), isSelected(), isOptionDisabled())}
                    >
                      {option.description}
                    </text>
                  </box>
                </Show>
                <Show when={layout() === 'expanded'}>
                  <text> </text>
                </Show>
              </box>
            )
          }

          return (
            <box flexDirection="column" flexShrink={0}>
              <box flexDirection="row">
                {indicator()}
                <text> </text>
                <text
                  dimmed={isOptionDisabled()}
                  fg={optionColor(isFocused(), isSelected(), isOptionDisabled())}
                >
                  <Show when={!hideIndexes()}>
                    <text dimmed>{`${i()}.`.padEnd(maxIndexWidth() + 2)}</text>
                  </Show>
                  {renderLabel(option)}
                  <Show when={inlineDescriptions() && option.description}>
                    <text dimmed={option.dimDescription !== false}> {option.description}</text>
                  </Show>
                </text>
                <Show when={isSelected()}>
                  <text fg="green"> {figures.tick}</text>
                </Show>
              </box>
              <Show when={!inlineDescriptions() && option.description}>
                <box paddingLeft={hideIndexes() ? 4 : maxIndexWidth() + 4}>
                  <text
                    dimmed={isOptionDisabled() || option.dimDescription !== false}
                    fg={optionColor(isFocused(), isSelected(), isOptionDisabled())}
                  >
                    {option.description}
                  </text>
                </box>
              </Show>
              <Show when={layout() === 'expanded'}>
                <text> </text>
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}
