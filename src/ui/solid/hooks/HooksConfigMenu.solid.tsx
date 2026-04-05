import type { JSX } from '@opentui/solid'
import { createMemo, createSignal, Show } from 'solid-js'
import type { HookEvent } from '../../../entrypoints/agentSdkTypes.js'
import { useAppState, useAppStateStore } from '../../../state/AppState.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { useSettingsChange } from '../../../hooks/useSettingsChange.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  getHookEventMetadata,
  getHooksForMatcher,
  getMatcherMetadata,
  getSortedMatchersForEvent,
  groupHooksByEventAndMatcher,
} from '../../../utils/hooks/hooksConfigManager.js'
import type { IndividualHookConfig } from '../../../utils/hooks/hooksSettings.js'
import {
  getSettings_DEPRECATED,
  getSettingsForSource,
} from '../../../utils/settings/settings.js'
import { plural } from '../../../utils/stringUtils.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { SelectEventMode } from '../../components/hooks/SelectEventMode.js'
import { SelectHookMode } from '../../components/hooks/SelectHookMode.js'
import { SelectMatcherMode } from '../../components/hooks/SelectMatcherMode.js'
import { ViewHookMode } from '../../components/hooks/ViewHookMode.js'

type Props = {
  toolNames: string[]
  onExit: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type ModeState =
  | { mode: 'select-event' }
  | { mode: 'select-matcher'; event: HookEvent }
  | { mode: 'select-hook'; event: HookEvent; matcher: string }
  | { mode: 'view-hook'; event: HookEvent; hook: IndividualHookConfig }

export function HooksConfigMenu(props: Props): JSX.Element {
  const [modeState, setModeState] = createSignal<ModeState>({
    mode: 'select-event',
  })

  const [disabledByPolicy, setDisabledByPolicy] = createSignal(() => {
    const settings = getSettings_DEPRECATED()
    const hooksDisabled = settings?.disableAllHooks === true
    return (
      hooksDisabled &&
      getSettingsForSource('policySettings')?.disableAllHooks === true
    )
  })

  const [restrictedByPolicy, setRestrictedByPolicy] = createSignal(
    () => getSettingsForSource('policySettings')?.allowManagedHooksOnly === true,
  )

  useSettingsChange(source => {
    if (source === 'policySettings') {
      const settings = getSettings_DEPRECATED()
      const hooksDisabled = settings?.disableAllHooks === true
      setDisabledByPolicy(
        () =>
          hooksDisabled &&
          getSettingsForSource('policySettings')?.disableAllHooks === true,
      )
      setRestrictedByPolicy(
        () =>
          getSettingsForSource('policySettings')?.allowManagedHooksOnly === true,
      )
    }
  })

  const mode = () => modeState().mode
  const selectedEvent = () =>
    'event' in modeState() ? (modeState() as any).event : 'PreToolUse'
  const selectedMatcher = () =>
    'matcher' in modeState() ? (modeState() as any).matcher : null

  const mcp = useAppState(s => s.mcp)
  const appStateStore = useAppStateStore()
  const combinedToolNames = createMemo(
    () => [...props.toolNames, ...mcp.tools.map(tool => tool.name)],
  )

  const hooksByEventAndMatcher = createMemo(() =>
    groupHooksByEventAndMatcher(appStateStore.getState(), combinedToolNames()),
  )

  const sortedMatchersForSelectedEvent = createMemo(() =>
    getSortedMatchersForEvent(hooksByEventAndMatcher(), selectedEvent()),
  )

  const hooksForSelectedMatcher = createMemo(() =>
    getHooksForMatcher(
      hooksByEventAndMatcher(),
      selectedEvent(),
      selectedMatcher(),
    ),
  )

  const handleExit = () => {
    props.onExit('Hooks dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleExit, {
    context: 'Confirmation',
    isActive: mode() === 'select-event',
  })

  useKeybinding(
    'confirm:no',
    () => {
      setModeState({ mode: 'select-event' })
    },
    {
      context: 'Confirmation',
      isActive: mode() === 'select-matcher',
    },
  )

  useKeybinding(
    'confirm:no',
    () => {
      const ms = modeState()
      if ('event' in ms) {
        if (
          getMatcherMetadata((ms as any).event, combinedToolNames()) !==
          undefined
        ) {
          setModeState({ mode: 'select-matcher', event: (ms as any).event })
        } else {
          setModeState({ mode: 'select-event' })
        }
      }
    },
    {
      context: 'Confirmation',
      isActive: mode() === 'select-hook',
    },
  )

  useKeybinding(
    'confirm:no',
    () => {
      const ms = modeState()
      if (ms.mode === 'view-hook') {
        const { event, hook } = ms
        setModeState({
          mode: 'select-hook',
          event,
          matcher: hook.matcher || '',
        })
      }
    },
    {
      context: 'Confirmation',
      isActive: mode() === 'view-hook',
    },
  )

  const hookEventMetadata = () => getHookEventMetadata(combinedToolNames())

  const settings = getSettings_DEPRECATED()
  const hooksDisabled = () => settings?.disableAllHooks === true

  const hookCounts = createMemo(() => {
    const byEvent: Partial<Record<HookEvent, number>> = {}
    let total = 0
    for (const [event, matchers] of Object.entries(hooksByEventAndMatcher())) {
      const eventCount = Object.values(matchers).reduce(
        (sum, hooks) => sum + hooks.length,
        0,
      )
      byEvent[event as HookEvent] = eventCount
      total += eventCount
    }
    return { hooksByEvent: byEvent, totalHooksCount: total }
  })

  return (
    <Show
      when={!hooksDisabled()}
      fallback={
        <Dialog
          title="Hook Configuration - Disabled"
          onCancel={handleExit}
          inputGuide={() => <text>Esc to close</text>}
        >
          <box flexDirection="column" gap={1}>
            <box flexDirection="column">
              <text>
                All hooks are currently <b>disabled</b>
                {disabledByPolicy()
                  ? ' by a managed settings file'
                  : ''}
                . You have{' '}
                <b>{hookCounts().totalHooksCount}</b> configured{' '}
                {plural(hookCounts().totalHooksCount, 'hook')} that{' '}
                {plural(hookCounts().totalHooksCount, 'is', 'are')} not running.
              </text>
              <box marginTop={1}>
                <text dimmed>When hooks are disabled:</text>
              </box>
              <text dimmed>{'\u00B7'} No hook commands will execute</text>
              <text dimmed>{'\u00B7'} StatusLine will not be displayed</text>
              <text dimmed>
                {'\u00B7'} Tool operations will proceed without hook validation
              </text>
            </box>
            <Show when={!disabledByPolicy()}>
              <text dimmed>
                To re-enable hooks, remove &quot;disableAllHooks&quot; from
                settings.json or ask Claude.
              </text>
            </Show>
          </box>
        </Dialog>
      }
    >
      <Show when={mode() === 'select-event'}>
        <SelectEventMode
          hookEventMetadata={hookEventMetadata()}
          hooksByEvent={hookCounts().hooksByEvent}
          totalHooksCount={hookCounts().totalHooksCount}
          restrictedByPolicy={restrictedByPolicy()()}
          onSelectEvent={(event: HookEvent) => {
            if (
              getMatcherMetadata(event, combinedToolNames()) !== undefined
            ) {
              setModeState({ mode: 'select-matcher', event })
            } else {
              setModeState({ mode: 'select-hook', event, matcher: '' })
            }
          }}
          onCancel={handleExit}
        />
      </Show>
      <Show when={mode() === 'select-matcher'}>
        <SelectMatcherMode
          selectedEvent={selectedEvent()}
          matchersForSelectedEvent={sortedMatchersForSelectedEvent()}
          hooksByEventAndMatcher={hooksByEventAndMatcher()}
          eventDescription={hookEventMetadata()[selectedEvent()].description}
          onSelect={(matcher: string) => {
            setModeState({
              mode: 'select-hook',
              event: selectedEvent(),
              matcher,
            })
          }}
          onCancel={() => {
            setModeState({ mode: 'select-event' })
          }}
        />
      </Show>
      <Show when={mode() === 'select-hook'}>
        <SelectHookMode
          selectedEvent={selectedEvent()}
          selectedMatcher={(modeState() as any).matcher ?? ''}
          hooksForSelectedMatcher={hooksForSelectedMatcher()}
          hookEventMetadata={hookEventMetadata()[selectedEvent()]}
          onSelect={(hook: IndividualHookConfig) => {
            setModeState({
              mode: 'view-hook',
              event: selectedEvent(),
              hook,
            })
          }}
          onCancel={() => {
            if (
              getMatcherMetadata(selectedEvent(), combinedToolNames()) !==
              undefined
            ) {
              setModeState({
                mode: 'select-matcher',
                event: selectedEvent(),
              })
            } else {
              setModeState({ mode: 'select-event' })
            }
          }}
        />
      </Show>
      <Show when={mode() === 'view-hook'}>
        <ViewHookMode
          selectedHook={(modeState() as any).hook}
          eventSupportsMatcher={
            getMatcherMetadata(selectedEvent(), combinedToolNames()) !==
            undefined
          }
          onCancel={() => {
            const ms = modeState() as any
            setModeState({
              mode: 'select-hook',
              event: ms.event,
              matcher: ms.hook.matcher || '',
            })
          }}
        />
      </Show>
    </Show>
  )
}
