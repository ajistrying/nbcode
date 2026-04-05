import type { JSX } from '@opentui/solid'
import { createMemo, createSignal, Show } from 'solid-js'
import capitalize from 'lodash-es/capitalize.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from '../../../utils/fastMode.js'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../../../state/AppState.js'
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../../../utils/effort.js'
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../../../utils/model/model.js'
import { getModelOptions } from '../../../utils/model/modelOptions.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../../utils/settings/settings.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { Pane } from '../../components/design-system/Pane.js'
import { effortLevelToSymbol } from '../../components/EffortIndicator.js'

export type Props = {
  initial: string | null
  sessionModel?: ModelSetting
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void
  onCancel?: () => void
  isStandaloneCommand?: boolean
  showFastModeNotice?: boolean
  headerText?: string
  skipSettingsWrite?: boolean
}

const NO_PREFERENCE = '__NO_PREFERENCE__'

export function ModelPicker(props: Props): JSX.Element {
  const setAppState = useSetAppState()
  const exitState = useExitOnCtrlCDWithKeybindings()
  const maxVisible = 10

  const initialValue = () => (props.initial === null ? NO_PREFERENCE : props.initial)
  const [focusedValue, setFocusedValue] = createSignal<string | undefined>(
    initialValue(),
  )

  const isFastMode = useAppState(s =>
    isFastModeEnabled() ? s.fastMode : false,
  )

  const [hasToggledEffort, setHasToggledEffort] = createSignal(false)
  const effortValue = useAppState(s => s.effortValue)
  const [effort, setEffort] = createSignal<EffortLevel | undefined>(
    effortValue !== undefined
      ? convertEffortValueToLevel(effortValue)
      : undefined,
  )

  const modelOptions = createMemo(
    () => getModelOptions(isFastMode ?? false),
  )

  const optionsWithInitial = createMemo(() => {
    if (
      props.initial !== null &&
      !modelOptions().some(opt => opt.value === props.initial)
    ) {
      return [
        ...modelOptions(),
        {
          value: props.initial!,
          label: modelDisplayString(props.initial!),
          description: 'Current model',
        },
      ]
    }
    return modelOptions()
  })

  const selectOptions = createMemo(() =>
    optionsWithInitial().map(opt => ({
      ...opt,
      value: opt.value === null ? NO_PREFERENCE : opt.value,
    })),
  )

  const initialFocusValue = createMemo(() =>
    selectOptions().some(_ => _.value === initialValue())
      ? initialValue()
      : (selectOptions()[0]?.value ?? undefined),
  )

  const visibleCount = () => Math.min(maxVisible, selectOptions().length)
  const hiddenCount = () => Math.max(0, selectOptions().length - visibleCount())

  const focusedModelName = () =>
    selectOptions().find(opt => opt.value === focusedValue())?.label
  const focusedModel = () => resolveOptionModel(focusedValue())
  const focusedSupportsEffort = () =>
    focusedModel() ? modelSupportsEffort(focusedModel()!) : false
  const focusedSupportsMax = () =>
    focusedModel() ? modelSupportsMaxEffort(focusedModel()!) : false
  const focusedDefaultEffort = () => getDefaultEffortLevelForOption(focusedValue())
  const displayEffort = () =>
    effort() === 'max' && !focusedSupportsMax() ? 'high' : effort()

  const handleFocus = (value: string) => {
    setFocusedValue(value)
    if (!hasToggledEffort() && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value))
    }
  }

  const handleCycleEffort = (direction: 'left' | 'right') => {
    if (!focusedSupportsEffort()) return
    setEffort(prev =>
      cycleEffortLevel(
        prev ?? focusedDefaultEffort(),
        direction,
        focusedSupportsMax(),
      ),
    )
    setHasToggledEffort(true)
  }

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    },
    { context: 'ModelPicker' },
  )

  function handleSelect(value: string): void {
    logEvent('tengu_model_command_menu_effort', {
      effort:
        effort() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    if (!props.skipSettingsWrite) {
      const effortLevel = resolvePickerEffortPersistence(
        effort(),
        getDefaultEffortLevelForOption(value),
        getSettingsForSource('userSettings')?.effortLevel,
        hasToggledEffort(),
      )
      const persistable = toPersistableEffort(effortLevel)
      if (persistable !== undefined) {
        updateSettingsForSource('userSettings', { effortLevel: persistable })
      }
      setAppState(prev => ({ ...prev, effortValue: effortLevel }))
    }

    const selectedModel = resolveOptionModel(value)
    const selectedEffort =
      hasToggledEffort() && selectedModel && modelSupportsEffort(selectedModel)
        ? effort()
        : undefined
    if (value === NO_PREFERENCE) {
      props.onSelect(null, selectedEffort)
      return
    }
    props.onSelect(value, selectedEffort)
  }

  const content = (
    <box flexDirection="column">
      <box flexDirection="column">
        <box marginBottom={1} flexDirection="column">
          <text fg="remember"><b>Select model</b></text>
          <text dimmed>
            {props.headerText ??
              'Switch between Claude models. Applies to this session and future Claude Code sessions. For other/previous model names, specify with --model.'}
          </text>
          <Show when={props.sessionModel}>
            <text dimmed>
              Currently using {modelDisplayString(props.sessionModel!)} for this
              session (set by plan mode). Selecting a model will undo this.
            </text>
          </Show>
        </box>

        <box flexDirection="column" marginBottom={1}>
          <box flexDirection="column">
            <Select
              defaultValue={initialValue()}
              defaultFocusValue={initialFocusValue()}
              options={selectOptions()}
              onChange={handleSelect}
              onFocus={handleFocus}
              onCancel={props.onCancel ?? (() => {})}
              visibleOptionCount={visibleCount()}
            />
          </box>
          <Show when={hiddenCount() > 0}>
            <box paddingLeft={3}>
              <text dimmed>and {hiddenCount()} more...</text>
            </box>
          </Show>
        </box>

        <box marginBottom={1} flexDirection="column">
          <Show
            when={focusedSupportsEffort()}
            fallback={
              <text fg="subtle">
                <EffortLevelIndicator effort={undefined} /> Effort not supported
                {focusedModelName() ? ` for ${focusedModelName()}` : ''}
              </text>
            }
          >
            <text dimmed>
              <EffortLevelIndicator effort={displayEffort()} />{' '}
              {capitalize(displayEffort())} effort
              {displayEffort() === focusedDefaultEffort() ? ` (default)` : ``}{' '}
              <text fg="subtle">{'\u2190'} {'\u2192'} to adjust</text>
            </text>
          </Show>
        </box>

        <Show when={isFastModeEnabled()}>
          <Show when={props.showFastModeNotice}>
            <box marginBottom={1}>
              <text dimmed>
                Fast mode is <b>ON</b> and available with{' '}
                {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other
                models turn off fast mode.
              </text>
            </box>
          </Show>
          <Show when={!props.showFastModeNotice && isFastModeAvailable() && !isFastModeCooldown()}>
            <box marginBottom={1}>
              <text dimmed>
                Use <b>/fast</b> to turn on Fast mode (
                {FAST_MODE_MODEL_DISPLAY} only).
              </text>
            </box>
          </Show>
        </Show>
      </box>

      <Show when={props.isStandaloneCommand}>
        <text dimmed>
          <Show
            when={!exitState.pending}
            fallback={<>Press {exitState.keyName} again to exit</>}
          >
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          </Show>
        </text>
      </Show>
    </box>
  )

  return (
    <Show when={props.isStandaloneCommand} fallback={content}>
      <Pane color="permission">{content}</Pane>
    </Show>
  )
}

function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined
  return value === NO_PREFERENCE
    ? getDefaultMainLoopModel()
    : parseUserSpecifiedModel(value)
}

function EffortLevelIndicator(props: {
  effort?: EffortLevel
}): JSX.Element {
  return (
    <text fg={props.effort ? 'claude' : 'subtle'}>
      {effortLevelToSymbol(props.effort ?? 'low')}
    </text>
  )
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  includeMax: boolean,
): EffortLevel {
  const levels: EffortLevel[] = includeMax
    ? ['low', 'medium', 'high', 'max']
    : ['low', 'medium', 'high']
  const idx = levels.indexOf(current)
  const currentIndex = idx !== -1 ? idx : levels.indexOf('high')
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!
  } else {
    return levels[(currentIndex - 1 + levels.length) % levels.length]!
  }
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel()
  const defaultValue = getDefaultEffortForModel(resolved)
  return defaultValue !== undefined
    ? convertEffortValueToLevel(defaultValue)
    : 'high'
}
