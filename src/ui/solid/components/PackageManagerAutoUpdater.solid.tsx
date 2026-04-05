import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import { useInterval } from 'usehooks-ts'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import {
  getLatestVersionFromGcs,
  getMaxVersion,
  shouldSkipVersion,
} from '../../../utils/autoUpdater.js'
import { isAutoUpdaterDisabled } from '../../../utils/config.js'
import { logForDebugging } from '../../../utils/debug.js'
import {
  getPackageManager,
  type PackageManager,
} from '../../../utils/nativeInstaller/packageManagers.js'
import { gt, gte } from '../../../utils/semver.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'

type Props = {
  isUpdating: boolean
  onChangeIsUpdating: (isUpdating: boolean) => void
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void
  autoUpdaterResult: AutoUpdaterResult | null
  showSuccessMessage: boolean
  verbose: boolean
}

export function PackageManagerAutoUpdater(props: Props): JSX.Element {
  const [updateAvailable, setUpdateAvailable] = createSignal(false)
  const [packageManager, setPackageManager] =
    createSignal<PackageManager>('unknown')

  const checkForUpdates = async () => {
    if (
      "production" === 'test' ||
      "production" === 'development'
    ) {
      return
    }

    if (isAutoUpdaterDisabled()) return

    const [channel, pm] = await Promise.all([
      Promise.resolve(getInitialSettings()?.autoUpdatesChannel ?? 'latest'),
      getPackageManager(),
    ])
    setPackageManager(pm)

    let latest = await getLatestVersionFromGcs(channel)

    const maxVersion = await getMaxVersion()

    if (maxVersion && latest && gt(latest, maxVersion)) {
      logForDebugging(
        `PackageManagerAutoUpdater: maxVersion ${maxVersion} is set, capping update from ${latest} to ${maxVersion}`,
      )
      if (gte(MACRO.VERSION, maxVersion)) {
        logForDebugging(
          `PackageManagerAutoUpdater: current version ${MACRO.VERSION} is already at or above maxVersion ${maxVersion}, skipping update`,
        )
        setUpdateAvailable(false)
        return
      }
      latest = maxVersion
    }

    const hasUpdate =
      latest && !gte(MACRO.VERSION, latest) && !shouldSkipVersion(latest)

    setUpdateAvailable(!!hasUpdate)

    if (hasUpdate) {
      logForDebugging(
        `PackageManagerAutoUpdater: Update available ${MACRO.VERSION} -> ${latest}`,
      )
    }
  }

  onMount(() => {
    void checkForUpdates()
  })

  useInterval(checkForUpdates, 30 * 60 * 1000)

  const updateCommand = () => {
    const pm = packageManager()
    if (pm === 'homebrew') return 'brew upgrade claude-code'
    if (pm === 'winget') return 'winget upgrade Anthropic.ClaudeCode'
    if (pm === 'apk') return 'apk upgrade claude-code'
    return 'your package manager update command'
  }

  return (
    <Show when={updateAvailable()}>
      <Show when={props.verbose}>
        <text dimmed>
          currentVersion: {MACRO.VERSION}
        </text>
      </Show>
      <text fg="warning">
        Update available! Run: <b>{updateCommand()}</b>
      </text>
    </Show>
  )
}
