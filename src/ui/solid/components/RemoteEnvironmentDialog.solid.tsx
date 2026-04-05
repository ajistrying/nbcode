import { createSignal, onMount, Show, type JSXElement } from 'solid-js'
import chalk from 'chalk'
import figures from 'figures'
import { toError } from '../../../utils/errors.js'
import { logError } from '../../../utils/log.js'
import { getSettingSourceName, type SettingSource } from '../../../utils/settings/constants.js'
import { updateSettingsForSource } from '../../../utils/settings/settings.js'
import { getEnvironmentSelectionInfo } from '../../../utils/teleport/environmentSelection.js'
import type { EnvironmentResource } from '../../../utils/teleport/environments.js'
import { ConfigurableShortcutHint } from '../design-system/ConfigurableShortcutHint.js'
import { Select } from '../components/CustomSelect/index.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { LoadingState } from '../design-system/LoadingState.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'

const DIALOG_TITLE = 'Select Remote Environment'
const SETUP_HINT = 'Configure environments at: https://claude.ai/code'

type Props = {
  onDone: (message?: string) => void
}

type LoadingStateType = 'loading' | 'updating' | null

export function RemoteEnvironmentDialog(props: Props): JSXElement {
  const [loadingState, setLoadingState] = createSignal<LoadingStateType>('loading')
  const [environments, setEnvironments] = createSignal<EnvironmentResource[]>([])
  const [selectedEnvironment, setSelectedEnvironment] = createSignal<EnvironmentResource | null>(null)
  const [selectedEnvironmentSource, setSelectedEnvironmentSource] = createSignal<SettingSource | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  onMount(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await getEnvironmentSelectionInfo()
        if (cancelled) return
        setEnvironments(result.availableEnvironments)
        setSelectedEnvironment(result.selectedEnvironment)
        setSelectedEnvironmentSource(result.selectedEnvironmentSource)
        setLoadingState(null)
      } catch (err) {
        if (cancelled) return
        const fetchError = toError(err)
        logError(fetchError)
        setError(fetchError.message)
        setLoadingState(null)
      }
    })()
    // cleanup not available in onMount, but signal won't fire post-unmount
  })

  function handleSelect(value: string) {
    if (value === 'cancel') {
      props.onDone()
      return
    }
    setLoadingState('updating')
    const selectedEnv = environments().find(env => env.environment_id === value)
    if (!selectedEnv) {
      props.onDone('Error: Selected environment not found')
      return
    }
    updateSettingsForSource('localSettings', {
      remote: { defaultEnvironmentId: selectedEnv.environment_id },
    })
    props.onDone(
      `Set default remote environment to ${chalk.bold(selectedEnv.name)} (${selectedEnv.environment_id})`,
    )
  }

  return (
    <>
      <Show when={loadingState() === 'loading'}>
        <Dialog title={DIALOG_TITLE} onCancel={props.onDone} hideInputGuide>
          <LoadingState message="Loading environments\u2026" />
        </Dialog>
      </Show>

      <Show when={loadingState() !== 'loading' && error()}>
        <Dialog title={DIALOG_TITLE} onCancel={props.onDone}>
          <text fg="error">Error: {error()}</text>
        </Dialog>
      </Show>

      <Show when={loadingState() !== 'loading' && !error() && !selectedEnvironment()}>
        <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={props.onDone}>
          <text>No remote environments available.</text>
        </Dialog>
      </Show>

      <Show when={loadingState() !== 'loading' && !error() && selectedEnvironment() && environments().length === 1}>
        <SingleEnvironmentContent
          environment={selectedEnvironment()!}
          onDone={props.onDone}
        />
      </Show>

      <Show when={loadingState() !== 'loading' && !error() && selectedEnvironment() && environments().length > 1}>
        <MultipleEnvironmentsContent
          environments={environments()}
          selectedEnvironment={selectedEnvironment()!}
          selectedEnvironmentSource={selectedEnvironmentSource()}
          loadingState={loadingState()}
          onSelect={handleSelect}
          onCancel={props.onDone}
        />
      </Show>
    </>
  )
}

function EnvironmentLabel(props: { environment: EnvironmentResource }): JSXElement {
  return (
    <text>
      {figures.tick} Using <b>{props.environment.name}</b>{' '}
      <text dimmed>({props.environment.environment_id})</text>
    </text>
  )
}

function SingleEnvironmentContent(props: {
  environment: EnvironmentResource
  onDone: () => void
}): JSXElement {
  useKeybinding('confirm:yes', props.onDone, { context: 'Confirmation' })

  return (
    <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={props.onDone}>
      <EnvironmentLabel environment={props.environment} />
    </Dialog>
  )
}

function MultipleEnvironmentsContent(props: {
  environments: EnvironmentResource[]
  selectedEnvironment: EnvironmentResource
  selectedEnvironmentSource: SettingSource | null
  loadingState: LoadingStateType
  onSelect: (value: string) => void
  onCancel: () => void
}): JSXElement {
  const sourceSuffix = () =>
    props.selectedEnvironmentSource && props.selectedEnvironmentSource !== 'localSettings'
      ? ` (from ${getSettingSourceName(props.selectedEnvironmentSource)} settings)`
      : ''

  const subtitle = () => (
    <text>
      Currently using: <b>{props.selectedEnvironment.name}</b>
      {sourceSuffix()}
    </text>
  )

  return (
    <Dialog title={DIALOG_TITLE} subtitle={subtitle()} onCancel={props.onCancel} hideInputGuide>
      <text dimmed>{SETUP_HINT}</text>
      <Show
        when={props.loadingState !== 'updating'}
        fallback={<LoadingState message="Updating\u2026" />}
      >
        <Select
          options={props.environments.map(env => ({
            label: (
              <text>
                {env.name} <text dimmed>({env.environment_id})</text>
              </text>
            ),
            value: env.environment_id,
          }))}
          defaultValue={props.selectedEnvironment.environment_id}
          onChange={props.onSelect}
          onCancel={() => props.onSelect('cancel')}
          layout="compact-vertical"
        />
      </Show>
      <text dimmed>
        <Byline>
          <KeyboardShortcutHint shortcut="Enter" action="select" />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        </Byline>
      </text>
    </Dialog>
  )
}
