import { createSignal } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { Pane } from '../../components/design-system/Pane.js'

export type Props = {
  currentValue: boolean
  onSelect: (enabled: boolean) => void
  onCancel?: () => void
  isMidConversation?: boolean
}

export function ThinkingToggle(props: Props): JSX.Element {
  const exitState = useExitOnCtrlCDWithKeybindings()
  const [confirmationPending, setConfirmationPending] = createSignal<boolean | null>(null)

  const options = [
    {
      value: 'true',
      label: 'Enabled',
      description: 'Claude will think before responding',
    },
    {
      value: 'false',
      label: 'Disabled',
      description: 'Claude will respond without extended thinking',
    },
  ]

  useKeybinding(
    'confirm:no',
    () => {
      if (confirmationPending() !== null) {
        setConfirmationPending(null)
      } else {
        props.onCancel?.()
      }
    },
    { context: 'Confirmation' },
  )

  useKeybinding(
    'confirm:yes',
    () => {
      if (confirmationPending() !== null) {
        props.onSelect(confirmationPending()!)
      }
    },
    {
      context: 'Confirmation',
      isActive: confirmationPending() !== null,
    },
  )

  function handleSelectChange(value: string) {
    const selected = value === 'true'
    if (props.isMidConversation && selected !== props.currentValue) {
      setConfirmationPending(selected)
    } else {
      props.onSelect(selected)
    }
  }

  return (
    <Pane color="permission">
      <box flexDirection="column">
        <box marginBottom={1} flexDirection="column">
          <text fg="remember"><b>Toggle thinking mode</b></text>
          <text dimmed>Enable or disable thinking for this session.</text>
        </box>
        <Show
          when={confirmationPending() !== null}
          fallback={
            <box flexDirection="column" marginBottom={1}>
              <Select
                defaultValue={props.currentValue ? 'true' : 'false'}
                defaultFocusValue={props.currentValue ? 'true' : 'false'}
                options={options}
                onChange={handleSelectChange}
                onCancel={props.onCancel ?? (() => {})}
                visibleOptionCount={2}
              />
            </box>
          }
        >
          <box flexDirection="column" marginBottom={1} gap={1}>
            <text fg="yellow">
              Changing thinking mode mid-conversation will increase latency and
              may reduce quality. For best results, set this at the start of a
              session.
            </text>
            <text fg="yellow">Do you want to proceed?</text>
          </box>
        </Show>
      </box>
      <text dimmed italic>
        <Show
          when={!exitState.pending}
          fallback={<>Press {exitState.keyName} again to exit</>}
        >
          <Show
            when={confirmationPending() !== null}
            fallback={
              <Byline>
                <KeyboardShortcutHint shortcut="Enter" action="confirm" />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="exit"
                />
              </Byline>
            }
          >
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </Show>
        </Show>
      </text>
    </Pane>
  )
}
