import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  type JSXElement,
} from 'solid-js'
import type {
  ElicitRequestFormParams,
  ElicitRequestURLParams,
  ElicitResult,
  PrimitiveSchemaDefinition,
} from '@modelcontextprotocol/sdk/types.js'
import figures from 'figures'
import { useRegisterOverlay } from '../../../context/overlayContext.js'
import { useNotifyAfterTimeout } from '../../../hooks/useNotifyAfterTimeout.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import type { ElicitationRequestEvent } from '../../../services/mcp/elicitationHandler.js'
import { openBrowser } from '../../../utils/browser.js'
import {
  getEnumLabel,
  getEnumValues,
  getMultiSelectLabel,
  getMultiSelectValues,
  isDateTimeSchema,
  isEnumSchema,
  isMultiSelectEnumSchema,
  validateElicitationInput,
  validateElicitationInputAsync,
} from '../../../utils/mcp/elicitationValidation.js'
import { plural } from '../../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../design-system/ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import TextInput from '../components/TextInput.solid.js'

type Props = {
  event: ElicitationRequestEvent
  onResponse: (action: ElicitResult['action'], content?: ElicitResult['content']) => void
  onWaitingDismiss?: (action: 'dismiss' | 'retry' | 'cancel') => void
}

const isTextField = (s: PrimitiveSchemaDefinition) =>
  ['string', 'number', 'integer'].includes(s.type)
const RESOLVING_SPINNER_CHARS = '\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F'
const advanceSpinnerFrame = (f: number) => (f + 1) % RESOLVING_SPINNER_CHARS.length

function ResolvingSpinner(): JSXElement {
  const [frame, setFrame] = createSignal(0)
  onMount(() => {
    const timer = setInterval(() => setFrame(advanceSpinnerFrame), 80)
    onCleanup(() => clearInterval(timer))
  })
  return <text fg="warning">{RESOLVING_SPINNER_CHARS[frame()]}</text>
}

function formatDateDisplay(isoValue: string, schema: PrimitiveSchemaDefinition): string {
  try {
    const date = new Date(isoValue)
    if (Number.isNaN(date.getTime())) return isoValue
    const format = 'format' in schema ? schema.format : undefined
    if (format === 'date-time') {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    }
    const parts = isoValue.split('-')
    if (parts.length === 3) {
      const local = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return local.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    }
    return isoValue
  } catch {
    return isoValue
  }
}

export function ElicitationDialog(props: Props): JSXElement {
  return (
    <Show
      when={props.event.params.mode === 'url'}
      fallback={<ElicitationFormDialog event={props.event} onResponse={props.onResponse} />}
    >
      <ElicitationURLDialog
        event={props.event}
        onResponse={props.onResponse}
        onWaitingDismiss={props.onWaitingDismiss}
      />
    </Show>
  )
}

function ElicitationFormDialog(innerProps: {
  event: ElicitationRequestEvent
  onResponse: Props['onResponse']
}): JSXElement {
  const { serverName, signal } = innerProps.event
  const request = innerProps.event.params as ElicitRequestFormParams
  const { message, requestedSchema } = request
  const hasFields = Object.keys(requestedSchema.properties).length > 0

  const [focusedButton, setFocusedButton] = createSignal<'accept' | 'decline' | null>(
    hasFields ? null : 'accept',
  )
  const [formValues, setFormValues] = createSignal<
    Record<string, string | number | boolean | string[]>
  >(() => {
    const initialValues: Record<string, string | number | boolean | string[]> = {}
    if (requestedSchema.properties) {
      for (const [propName, propSchema] of Object.entries(requestedSchema.properties)) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          if (propSchema.default !== undefined) {
            initialValues[propName] = propSchema.default
          }
        }
      }
    }
    return initialValues
  })

  const [validationErrors, setValidationErrors] = createSignal<Record<string, string>>(() => {
    const initialErrors: Record<string, string> = {}
    for (const [propName, propSchema] of Object.entries(requestedSchema.properties)) {
      if (isTextField(propSchema) && propSchema?.default !== undefined) {
        const validation = validateElicitationInput(String(propSchema.default), propSchema)
        if (!validation.isValid && validation.error) {
          initialErrors[propName] = validation.error
        }
      }
    }
    return initialErrors
  })

  const [focusedFieldIndex, setFocusedFieldIndex] = createSignal(0)
  const [isResolving, setIsResolving] = createSignal<Record<string, boolean>>({})

  // Handle abort signal
  createEffect(() => {
    if (!signal) return
    const handleAbort = () => innerProps.onResponse('cancel')
    if (signal.aborted) {
      handleAbort()
      return
    }
    signal.addEventListener('abort', handleAbort)
    onCleanup(() => signal.removeEventListener('abort', handleAbort))
  })

  const schemaFields = createMemo(() =>
    Object.entries(requestedSchema.properties).map(([name, schema]) => ({
      name,
      schema,
      required: requestedSchema.required?.includes(name) ?? false,
    })),
  )

  useRegisterOverlay('elicitation-dialog')

  function handleAccept() {
    // Validate all fields
    const errors: Record<string, string> = {}
    let hasErrors = false
    for (const field of schemaFields()) {
      const value = formValues()[field.name]
      if (field.required && (value === undefined || value === '')) {
        errors[field.name] = 'This field is required'
        hasErrors = true
      }
    }
    if (hasErrors) {
      setValidationErrors(errors)
      return
    }

    // Build result content
    const content: Record<string, unknown> = {}
    for (const field of schemaFields()) {
      const value = formValues()[field.name]
      if (value !== undefined) {
        content[field.name] = value
      }
    }
    innerProps.onResponse('accept', content as ElicitResult['content'])
  }

  function handleDecline() {
    innerProps.onResponse('decline')
  }

  function updateFieldValue(name: string, value: string | number | boolean | string[]) {
    setFormValues(prev => ({ ...prev, [name]: value }))
    // Validate
    const field = schemaFields().find(f => f.name === name)
    if (field && isTextField(field.schema) && typeof value === 'string') {
      const validation = validateElicitationInput(value, field.schema)
      setValidationErrors(prev => {
        if (validation.isValid) {
          const next = { ...prev }
          delete next[name]
          return next
        }
        return { ...prev, [name]: validation.error! }
      })
    }
  }

  return (
    <Dialog title={`${serverName}: Input Required`} onCancel={handleDecline}>
      <box flexDirection="column" gap={1}>
        <Show when={message}>
          <text>{message}</text>
        </Show>

        <For each={schemaFields()}>
          {(field, i) => {
            const isFocused = () => i() === focusedFieldIndex() && focusedButton() === null
            const value = () => formValues()[field.name]
            const error = () => validationErrors()[field.name]
            const resolving = () => isResolving()[field.name]

            return (
              <box flexDirection="column">
                <text>
                  {isFocused() ? figures.pointer : ' '}{' '}
                  <b>{field.schema.title ?? field.name}</b>
                  {field.required ? ' *' : ''}
                  <Show when={field.schema.description}>
                    <text dimmed> ({field.schema.description})</text>
                  </Show>
                </text>

                <Show when={isTextField(field.schema)}>
                  <Show when={isFocused()} fallback={<text dimmed>  {String(value() ?? '')}</text>}>
                    <box paddingLeft={2}>
                      <TextInput
                        value={String(value() ?? '')}
                        onChange={(v: string) => updateFieldValue(field.name, v)}
                        placeholder={field.schema.description ?? ''}
                      />
                    </box>
                  </Show>
                </Show>

                <Show when={field.schema.type === 'boolean'}>
                  <text>
                    {'  '}
                    {resolving() ? (
                      <ResolvingSpinner />
                    ) : value() ? (
                      figures.checkboxOn
                    ) : (
                      figures.checkboxOff
                    )}{' '}
                    {field.schema.title ?? field.name}
                  </text>
                </Show>

                <Show when={isEnumSchema(field.schema)}>
                  <text>  {getEnumLabel(field.schema, value() as string)}</text>
                </Show>

                <Show when={error()}>
                  <text fg="error">  {error()}</text>
                </Show>
              </box>
            )
          }}
        </For>

        {/* Action buttons */}
        <box flexDirection="row" gap={2}>
          <text>
            {focusedButton() === 'accept' ? figures.pointer : ' '}{' '}
            <text fg={focusedButton() === 'accept' ? 'green' : undefined}>Submit</text>
          </text>
          <text>
            {focusedButton() === 'decline' ? figures.pointer : ' '}{' '}
            <text fg={focusedButton() === 'decline' ? 'red' : undefined}>Cancel</text>
          </text>
        </box>
      </box>
    </Dialog>
  )
}

function ElicitationURLDialog(innerProps: {
  event: ElicitationRequestEvent
  onResponse: Props['onResponse']
  onWaitingDismiss?: Props['onWaitingDismiss']
}): JSXElement {
  const { serverName, signal } = innerProps.event
  const request = innerProps.event.params as ElicitRequestURLParams
  const { message, url } = request

  const [phase, setPhase] = createSignal<'prompt' | 'waiting'>('prompt')
  const [waitingDots, setWaitingDots] = createSignal(0)

  // Handle abort signal
  createEffect(() => {
    if (!signal) return
    const handleAbort = () => innerProps.onResponse('cancel')
    if (signal.aborted) {
      handleAbort()
      return
    }
    signal.addEventListener('abort', handleAbort)
    onCleanup(() => signal.removeEventListener('abort', handleAbort))
  })

  // Animate waiting dots
  createEffect(() => {
    if (phase() !== 'waiting') return
    const timer = setInterval(() => setWaitingDots(d => (d + 1) % 4), 500)
    onCleanup(() => clearInterval(timer))
  })

  useRegisterOverlay('elicitation-url-dialog')

  function handleOpenBrowser() {
    void openBrowser(url)
    setPhase('waiting')
  }

  return (
    <Dialog title={`${serverName}: Action Required`} onCancel={() => innerProps.onResponse('decline')}>
      <box flexDirection="column" gap={1}>
        <Show when={message}>
          <text>{message}</text>
        </Show>

        <Show when={phase() === 'prompt'}>
          <text>
            Open URL: <text fg="blue">{url}</text>
          </text>
          <Select
            options={[
              { label: 'Open in browser', value: 'open' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onChange={(v: string) => {
              if (v === 'open') handleOpenBrowser()
              else innerProps.onResponse('decline')
            }}
          />
        </Show>

        <Show when={phase() === 'waiting'}>
          <text>
            Waiting for response{'.'.repeat(waitingDots())}
          </text>
          <Select
            options={[
              { label: 'Dismiss (keep waiting)', value: 'dismiss' },
              { label: 'Retry', value: 'retry' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onChange={(v: string) => {
              if (v === 'dismiss') innerProps.onWaitingDismiss?.('dismiss')
              else if (v === 'retry') {
                setPhase('prompt')
                innerProps.onWaitingDismiss?.('retry')
              } else {
                innerProps.onResponse('decline')
                innerProps.onWaitingDismiss?.('cancel')
              }
            }}
          />
        </Show>
      </box>
    </Dialog>
  )
}
