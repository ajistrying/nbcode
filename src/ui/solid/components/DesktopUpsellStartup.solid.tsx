import { createSignal, onMount, Show, type JSXElement } from 'solid-js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { logEvent } from '../../../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { Select } from '../../solid/components/CustomSelect/select.js'
import { DesktopHandoff } from '../../solid/components/DesktopHandoff.js'
import { PermissionDialog } from '../../solid/permissions/PermissionDialog.js'

type DesktopUpsellConfig = {
  enable_shortcut_tip: boolean
  enable_startup_dialog: boolean
}

const DESKTOP_UPSELL_DEFAULT: DesktopUpsellConfig = {
  enable_shortcut_tip: false,
  enable_startup_dialog: false,
}

export function getDesktopUpsellConfig(): DesktopUpsellConfig {
  return getDynamicConfig_CACHED_MAY_BE_STALE(
    'tengu_desktop_upsell',
    DESKTOP_UPSELL_DEFAULT,
  )
}

function isSupportedPlatform(): boolean {
  return (
    process.platform === 'darwin' ||
    (process.platform === 'win32' && process.arch === 'x64')
  )
}

export function shouldShowDesktopUpsellStartup(): boolean {
  if (!isSupportedPlatform()) return false
  if (!getDesktopUpsellConfig().enable_startup_dialog) return false
  const config = getGlobalConfig()
  if (config.desktopUpsellDismissed) return false
  if ((config.desktopUpsellSeenCount ?? 0) >= 3) return false
  return true
}

type DesktopUpsellSelection = 'try' | 'not-now' | 'never'

type Props = {
  onDone: () => void
}

export function DesktopUpsellStartup(props: Props): JSXElement {
  const [showHandoff, setShowHandoff] = createSignal(false)

  onMount(() => {
    const newCount = (getGlobalConfig().desktopUpsellSeenCount ?? 0) + 1
    saveGlobalConfig((prev: any) => {
      if ((prev.desktopUpsellSeenCount ?? 0) >= newCount) return prev
      return { ...prev, desktopUpsellSeenCount: newCount }
    })
    logEvent('tengu_desktop_upsell_shown', { seen_count: newCount })
  })

  function handleSelect(value: DesktopUpsellSelection): void {
    switch (value) {
      case 'try':
        setShowHandoff(true)
        return
      case 'never':
        saveGlobalConfig((prev: any) => {
          if (prev.desktopUpsellDismissed) return prev
          return { ...prev, desktopUpsellDismissed: true }
        })
        props.onDone()
        return
      case 'not-now':
        props.onDone()
        return
    }
  }

  const options = [
    { label: 'Open in Claude Code Desktop', value: 'try' as const },
    { label: 'Not now', value: 'not-now' as const },
    { label: "Don't ask again", value: 'never' as const },
  ]

  return (
    <Show
      when={!showHandoff()}
      fallback={<DesktopHandoff onDone={() => props.onDone()} />}
    >
      <PermissionDialog title="Try Claude Code Desktop">
        <box flexDirection="column" paddingX={2} paddingY={1}>
          <box marginBottom={1}>
            <text>
              Same Claude Code with visual diffs, live app preview, parallel
              sessions, and more.
            </text>
          </box>
          <Select
            options={options}
            onChange={handleSelect}
            onCancel={() => handleSelect('not-now')}
          />
        </box>
      </PermissionDialog>
    </Show>
  )
}
