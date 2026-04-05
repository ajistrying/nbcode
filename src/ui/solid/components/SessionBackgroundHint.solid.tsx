import { createSignal, Show, type JSXElement } from 'solid-js'
import { useDoublePress } from '../../../hooks/useDoublePress.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../../../keybindings/useShortcutDisplay.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from '../../../state/AppState.js'
import {
  backgroundAll,
  hasForegroundTasks,
} from '../../../tasks/LocalShellTask/LocalShellTask.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { env } from '../../../utils/env.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { KeyboardShortcutHint } from '../../solid/design-system/KeyboardShortcutHint.js'

type Props = {
  onBackgroundSession: () => void
  isLoading: boolean
}

export function SessionBackgroundHint(props: Props): JSXElement {
  const setAppState = useSetAppState()
  const appStateStore = useAppStateStore()

  const [showSessionHint, setShowSessionHint] = createSignal(false)

  const handleDoublePress = useDoublePress(
    setShowSessionHint,
    props.onBackgroundSession,
    () => {},
  )

  const handleBackground = () => {
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
      return
    }
    const state = appStateStore.getState()
    if (hasForegroundTasks(state)) {
      backgroundAll(() => appStateStore.getState(), setAppState)
      if (!getGlobalConfig().hasUsedBackgroundTask) {
        saveGlobalConfig((c: any) =>
          c.hasUsedBackgroundTask ? c : { ...c, hasUsedBackgroundTask: true },
        )
      }
    } else {
      if (isEnvTruthy('false') && props.isLoading) {
        handleDoublePress()
      }
    }
  }

  const hasForeground = useAppState(hasForegroundTasks)
  const sessionBgEnabled = isEnvTruthy('false')

  useKeybinding('task:background', handleBackground, {
    context: 'Task',
    get isActive() {
      return hasForeground() || (sessionBgEnabled && props.isLoading)
    },
  })

  const baseShortcut = useShortcutDisplay(
    'task:background',
    'Task',
    'ctrl+b',
  )
  const shortcut = () =>
    env.terminal === 'tmux' && baseShortcut === 'ctrl+b'
      ? 'ctrl+b ctrl+b'
      : baseShortcut

  return (
    <Show when={props.isLoading && showSessionHint()}>
      <box paddingLeft={2}>
        <text dimmed>
          <KeyboardShortcutHint shortcut={shortcut()} action="background" />
        </text>
      </box>
    </Show>
  )
}
