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
import { feature } from 'bun:bundle'
import figures from 'figures'
import chalk from 'chalk'
import type { CommandResultDisplay, LocalJSXCommandContext } from '../../../commands.js'
import {
  type GlobalConfig,
  saveGlobalConfig,
  getCurrentProjectConfig,
  type OutputStyle,
  getGlobalConfig,
  getAutoUpdaterDisabledReason,
  formatAutoUpdaterDisabledReason,
  getRemoteControlAtStartup,
} from '../../../utils/config.js'
import { normalizeApiKeyForConfig } from '../../../utils/authPortable.js'
import {
  permissionModeTitle,
  permissionModeFromString,
  toExternalPermissionMode,
  isExternalPermissionMode,
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
  type ExternalPermissionMode,
  type PermissionMode,
} from '../../../utils/permissions/PermissionMode.js'
import {
  getAutoModeEnabledState,
  hasAutoModeOptInAnySource,
  transitionPlanAutoMode,
} from '../../../utils/permissions/permissionSetup.js'
import { logError } from '../../../utils/log.js'
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { isBridgeEnabled } from '../../../bridge/bridgeEnabled.js'
import { ThemePicker } from '../components/ThemePicker.solid.js'
import { useAppState, useSetAppState, useAppStateStore } from '../../../state/AppState.js'
import { ModelPicker } from '../components/ModelPicker.solid.js'
import { modelDisplayString, isOpus1mMergeEnabled } from '../../../utils/model/model.js'
import { isBilledAsExtraUsage } from '../../../utils/extraUsage.js'
import { ClaudeMdExternalIncludesDialog } from '../components/ClaudeMdExternalIncludesDialog.solid.js'
import { Dialog } from '../design-system/Dialog.js'
import { Select } from '../components/CustomSelect/index.js'
import { OutputStylePicker } from '../components/OutputStylePicker.solid.js'
import { LanguagePicker } from '../components/LanguagePicker.solid.js'
import { getExternalClaudeMdIncludes, getMemoryFiles, hasExternalClaudeMdIncludes } from 'src/utils/claudemd.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { ConfigurableShortcutHint } from '../design-system/ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { useTabHeaderFocus } from '../design-system/Tabs.js'
import { useIsInsideModal } from '../../../context/modalContext.js'
import { SearchBox } from '../components/SearchBox.solid.js'
import { isSupportedTerminal, hasAccessToIDEExtensionDiffFeature } from '../../../utils/ide.js'
import {
  getInitialSettings,
  getSettingsForSource,
  updateSettingsForSource,
} from '../../../utils/settings/settings.js'
import { getUserMsgOptIn, setUserMsgOptIn } from '../../../bootstrap/state.js'
import { DEFAULT_OUTPUT_STYLE_NAME } from 'src/constants/outputStyles.js'
import { isEnvTruthy, isRunningOnHomespace } from 'src/utils/envUtils.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { useSearchInput } from '../../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useKeybinding, useKeybindings } from '../../../keybindings/useKeybinding.js'
import {
  clearFastModeCooldown,
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeEnabled,
  getFastModeModel,
  isFastModeSupportedByModel,
} from '../../../utils/fastMode.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'

type Props = {
  onClose: (result?: string, options?: { display?: CommandResultDisplay }) => void
  context: LocalJSXCommandContext
  setTabsHidden: (hidden: boolean) => void
  onIsSearchModeChange?: (inSearchMode: boolean) => void
  contentHeight?: number
}

type SettingBase =
  | { id: string; label: string }
  | { id: string; label: JSXElement; searchText: string }

type Setting =
  | (SettingBase & { value: boolean; onChange(value: boolean): void; type: 'boolean' })
  | (SettingBase & {
      value: string
      options: string[]
      onChange(value: string): void
      type: 'enum'
    })
  | (SettingBase & { value: string; onChange(value: string): void; type: 'managedEnum' })

type SubMenu =
  | 'Theme'
  | 'Model'
  | 'TeammateModel'
  | 'ExternalIncludes'
  | 'OutputStyle'
  | 'ChannelDowngrade'
  | 'Language'
  | 'EnableAutoUpdates'

export function Config(props: Props): JSXElement {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const insideModal = useIsInsideModal()
  const [globalConfig, setGlobalConfigState] = createSignal(getGlobalConfig())
  let initialConfig = getGlobalConfig()
  const [settingsData, setSettingsData] = createSignal(getInitialSettings())
  let initialSettingsData = getInitialSettings()
  const [currentOutputStyle, setCurrentOutputStyle] = createSignal<OutputStyle>(
    settingsData()?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME,
  )
  let initialOutputStyle = currentOutputStyle()
  const [currentLanguage, setCurrentLanguage] = createSignal<string | undefined>(
    settingsData()?.language,
  )
  let initialLanguage = currentLanguage()
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [scrollOffset, setScrollOffset] = createSignal(0)
  const [isSearchMode, setIsSearchMode] = createSignal(true)
  const { rows } = useTerminalSize()
  const paneCap = () => props.contentHeight ?? Math.min(Math.floor(rows - rows * 0.2), 30)
  const maxVisible = createMemo(() => Math.max(5, paneCap() - 10))

  const mainLoopModel = useAppState((s: any) => s.mainLoopModel)
  const verbose = useAppState((s: any) => s.verbose)
  const thinkingEnabled = useAppState((s: any) => s.thinkingEnabled)
  const isFastMode = useAppState((s: any) => (isFastModeEnabled() ? s.fastMode : false))
  const promptSuggestionEnabled = useAppState((s: any) => s.promptSuggestionEnabled)

  const showAutoInDefaultModePicker = feature('TRANSCRIPT_CLASSIFIER')
    ? hasAutoModeOptInAnySource() || getAutoModeEnabledState() === 'enabled'
    : false

  const setAppState = useSetAppState()
  const store = useAppStateStore()
  const [changes, setChanges] = createSignal<Record<string, unknown>>({})
  let isDirty = false
  const [showThinkingWarning, setShowThinkingWarning] = createSignal(false)
  const [showSubmenu, setShowSubmenu] = createSignal<SubMenu | null>(null)

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: () => isSearchMode() && showSubmenu() === null && !headerFocused,
    onExit: () => setIsSearchMode(false),
    onExitUp: focusHeader,
    passthroughCtrlKeys: ['c', 'd'],
  })

  // Tell parent about search mode
  const ownsEsc = createMemo(() => isSearchMode() && !headerFocused)
  createEffect(() => {
    props.onIsSearchModeChange?.(ownsEsc())
  })

  const isConnectedToIde = hasAccessToIDEExtensionDiffFeature(props.context.options.mcpClients)
  const isFileCheckpointingAvailable = !isEnvTruthy(
    process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING,
  )

  // Build settings list
  const allSettings = createMemo((): Setting[] => {
    const settings: Setting[] = []
    const config = globalConfig()
    const sd = settingsData()

    // Theme
    settings.push({
      id: 'theme',
      label: 'Theme',
      value: config.theme ?? 'system',
      type: 'managedEnum',
      onChange: () => setShowSubmenu('Theme'),
    })

    // Model
    settings.push({
      id: 'model',
      label: 'Model',
      value: modelDisplayString(mainLoopModel),
      type: 'managedEnum',
      onChange: () => setShowSubmenu('Model'),
    })

    // Verbose
    settings.push({
      id: 'verbose',
      label: 'Verbose output',
      value: verbose ?? false,
      type: 'boolean',
      onChange: (v: boolean) => {
        isDirty = true
        setAppState((prev: any) => ({ ...prev, verbose: v }))
        setChanges(prev => ({ ...prev, verbose: v }))
      },
    })

    // Thinking
    settings.push({
      id: 'thinking',
      label: 'Extended thinking',
      value: thinkingEnabled ?? true,
      type: 'boolean',
      onChange: (v: boolean) => {
        isDirty = true
        setAppState((prev: any) => ({ ...prev, thinkingEnabled: v }))
        setChanges(prev => ({ ...prev, thinkingEnabled: v }))
        logEvent('tengu_thinking_toggled_settings', { enabled: v })
      },
    })

    // Prompt suggestions
    settings.push({
      id: 'promptSuggestion',
      label: 'Prompt suggestions',
      value: promptSuggestionEnabled ?? true,
      type: 'boolean',
      onChange: (v: boolean) => {
        isDirty = true
        setAppState((prev: any) => ({ ...prev, promptSuggestionEnabled: v }))
        updateSettingsForSource('userSettings', { promptSuggestions: v })
        setChanges(prev => ({ ...prev, promptSuggestion: v }))
      },
    })

    // Output style
    settings.push({
      id: 'outputStyle',
      label: 'Output style',
      value: currentOutputStyle(),
      type: 'managedEnum',
      onChange: () => setShowSubmenu('OutputStyle'),
    })

    // Language
    settings.push({
      id: 'language',
      label: 'Language',
      value: currentLanguage() ?? 'Default',
      type: 'managedEnum',
      onChange: () => setShowSubmenu('Language'),
    })

    // Fast mode (conditional)
    if (isFastModeEnabled()) {
      settings.push({
        id: 'fastMode',
        label: `Fast mode (${FAST_MODE_MODEL_DISPLAY})`,
        value: isFastMode ?? false,
        type: 'boolean',
        onChange: (v: boolean) => {
          isDirty = true
          setAppState((prev: any) => ({ ...prev, fastMode: v }))
          setChanges(prev => ({ ...prev, fastMode: v }))
          if (!v) clearFastModeCooldown()
        },
      })
    }

    // File checkpointing
    if (isFileCheckpointingAvailable) {
      settings.push({
        id: 'fileCheckpointing',
        label: 'File checkpointing',
        value: sd?.fileCheckpointing !== false,
        type: 'boolean',
        onChange: (v: boolean) => {
          isDirty = true
          updateSettingsForSource('localSettings', { fileCheckpointing: v })
          setSettingsData(getInitialSettings())
          setChanges(prev => ({ ...prev, fileCheckpointing: v }))
        },
      })
    }

    return settings
  })

  // Filter settings by search query
  const filteredSettings = createMemo(() => {
    const query = searchQuery().toLowerCase()
    if (!query) return allSettings()
    return allSettings().filter(s => {
      const label = typeof s.label === 'string' ? s.label : (s as any).searchText ?? ''
      return label.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
    })
  })

  // Clamp selected index
  createEffect(() => {
    const max = filteredSettings().length - 1
    if (selectedIndex() > max) setSelectedIndex(Math.max(0, max))
  })

  function handleClose() {
    props.onClose()
  }

  function revertChanges() {
    if (!isDirty) return
    // Revert AppState changes
    setAppState((prev: any) => ({
      ...prev,
      verbose: store.getState().verbose,
      thinkingEnabled: store.getState().thinkingEnabled,
      fastMode: store.getState().fastMode,
      promptSuggestionEnabled: store.getState().promptSuggestionEnabled,
    }))
  }

  useKeybinding('confirm:no', () => {
    if (showSubmenu()) {
      setShowSubmenu(null)
      props.setTabsHidden(false)
      return
    }
    if (isSearchMode()) {
      setIsSearchMode(false)
      return
    }
    revertChanges()
    handleClose()
  }, { context: 'Confirmation' })

  // Submenu handling
  return (
    <Show
      when={!showSubmenu()}
      fallback={
        <>
          <Show when={showSubmenu() === 'Theme'}>
            <ThemePicker
              onDone={() => {
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
            />
          </Show>
          <Show when={showSubmenu() === 'Model'}>
            <ModelPicker
              initial={mainLoopModel}
              onSelect={(model: string | null) => {
                isDirty = true
                setAppState((prev: any) => ({
                  ...prev,
                  mainLoopModel: model,
                  mainLoopModelForSession: null,
                }))
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
              onCancel={() => {
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
            />
          </Show>
          <Show when={showSubmenu() === 'OutputStyle'}>
            <OutputStylePicker
              current={currentOutputStyle()}
              onSelect={(style: OutputStyle) => {
                isDirty = true
                setCurrentOutputStyle(style)
                updateSettingsForSource('localSettings', { outputStyle: style })
                setSettingsData(getInitialSettings())
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
              onCancel={() => {
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
            />
          </Show>
          <Show when={showSubmenu() === 'Language'}>
            <LanguagePicker
              current={currentLanguage()}
              onSelect={(lang: string | undefined) => {
                isDirty = true
                setCurrentLanguage(lang)
                updateSettingsForSource('userSettings', { language: lang })
                setSettingsData(getInitialSettings())
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
              onCancel={() => {
                setShowSubmenu(null)
                props.setTabsHidden(false)
              }}
            />
          </Show>
        </>
      }
    >
      <box flexDirection="column">
        <SearchBox
          value={searchQuery()}
          cursorOffset={searchCursorOffset}
          placeholder="Search settings..."
          isActive={isSearchMode()}
        />

        <box flexDirection="column" marginTop={1}>
          <For each={filteredSettings().slice(scrollOffset(), scrollOffset() + maxVisible())}>
            {(setting, i) => {
              const idx = () => scrollOffset() + i()
              const isSelected = () => idx() === selectedIndex()

              return (
                <box flexDirection="row" gap={1}>
                  <text>{isSelected() ? figures.pointer : ' '}</text>
                  <text>{typeof setting.label === 'string' ? setting.label : setting.label}</text>
                  <text dimmed>
                    {setting.type === 'boolean'
                      ? setting.value
                        ? figures.checkboxOn
                        : figures.checkboxOff
                      : setting.value}
                  </text>
                </box>
              )
            }}
          </For>
        </box>

        <box marginTop={1}>
          <text dimmed>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="toggle/select" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="close"
              />
            </Byline>
          </text>
        </box>
      </box>
    </Show>
  )
}
