import { createSignal, createEffect, onMount, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { useUpdateNotification } from '../../../hooks/useUpdateNotification.js'
import {
  type AutoUpdaterResult,
  getLatestVersion,
  getMaxVersion,
  type InstallStatus,
  installGlobalPackage,
  shouldSkipVersion,
} from '../../../utils/autoUpdater.js'
import { getGlobalConfig, isAutoUpdaterDisabled } from '../../../utils/config.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getCurrentInstallationType } from '../../../utils/doctorDiagnostic.js'
import {
  installOrUpdateClaudePackage,
  localInstallationExists,
} from '../../../utils/localInstaller.js'
import { removeInstalledSymlink } from '../../../utils/nativeInstaller/index.js'
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

export function AutoUpdater(props: Props): JSX.Element {
  const [versions, setVersions] = createSignal<{
    global?: string | null
    latest?: string | null
  }>({})
  const [hasLocalInstall, setHasLocalInstall] = createSignal(false)
  const updateSemver = useUpdateNotification(() => props.autoUpdaterResult?.version)

  onMount(() => {
    void localInstallationExists().then(setHasLocalInstall)
  })

  // Track latest isUpdating value in a ref so the checkForUpdates
  // callback always sees the current value.
  let isUpdatingRef = props.isUpdating
  createEffect(() => {
    isUpdatingRef = props.isUpdating
  })

  const checkForUpdates = async () => {
    if (isUpdatingRef) {
      return
    }

    if (
      "production" === 'test' ||
      "production" === 'development'
    ) {
      logForDebugging(
        'AutoUpdater: Skipping update check in test/dev environment',
      )
      return
    }

    const currentVersion = MACRO.VERSION
    const channel = getInitialSettings()?.autoUpdatesChannel ?? 'latest'
    let latestVersion = await getLatestVersion(channel)
    const isDisabled = isAutoUpdaterDisabled()

    const maxVersion = await getMaxVersion()
    if (maxVersion && latestVersion && gt(latestVersion, maxVersion)) {
      logForDebugging(
        `AutoUpdater: maxVersion ${maxVersion} is set, capping update from ${latestVersion} to ${maxVersion}`,
      )
      if (gte(currentVersion, maxVersion)) {
        logForDebugging(
          `AutoUpdater: current version ${currentVersion} is already at or above maxVersion ${maxVersion}, skipping update`,
        )
        setVersions({ global: currentVersion, latest: latestVersion })
        return
      }
      latestVersion = maxVersion
    }

    setVersions({ global: currentVersion, latest: latestVersion })

    if (
      !isDisabled &&
      currentVersion &&
      latestVersion &&
      !gte(currentVersion, latestVersion) &&
      !shouldSkipVersion(latestVersion)
    ) {
      const startTime = Date.now()
      props.onChangeIsUpdating(true)

      const config = getGlobalConfig()
      if (config.installMethod !== 'native') {
        await removeInstalledSymlink()
      }

      const installationType = await getCurrentInstallationType()
      logForDebugging(
        `AutoUpdater: Detected installation type: ${installationType}`,
      )

      if (installationType === 'development') {
        logForDebugging('AutoUpdater: Cannot auto-update development build')
        props.onChangeIsUpdating(false)
        return
      }

      let installStatus: InstallStatus
      let updateMethod: 'local' | 'global'

      if (installationType === 'npm-local') {
        logForDebugging('AutoUpdater: Using local update method')
        updateMethod = 'local'
        installStatus = await installOrUpdateClaudePackage(channel)
      } else if (installationType === 'npm-global') {
        logForDebugging('AutoUpdater: Using global update method')
        updateMethod = 'global'
        installStatus = await installGlobalPackage()
      } else if (installationType === 'native') {
        logForDebugging(
          'AutoUpdater: Unexpected native installation in non-native updater',
        )
        props.onChangeIsUpdating(false)
        return
      } else {
        logForDebugging(
          `AutoUpdater: Unknown installation type, falling back to config`,
        )
        const isMigrated = config.installMethod === 'local'
        updateMethod = isMigrated ? 'local' : 'global'

        if (isMigrated) {
          installStatus = await installOrUpdateClaudePackage(channel)
        } else {
          installStatus = await installGlobalPackage()
        }
      }

      props.onChangeIsUpdating(false)

      if (installStatus === 'success') {
        logEvent('tengu_auto_updater_success', {
          fromVersion:
            currentVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          toVersion:
            latestVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          durationMs: Date.now() - startTime,
          wasMigrated: updateMethod === 'local',
          installationType:
            installationType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      } else {
        logEvent('tengu_auto_updater_fail', {
          fromVersion:
            currentVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          attemptedVersion:
            latestVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          status:
            installStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          durationMs: Date.now() - startTime,
          wasMigrated: updateMethod === 'local',
          installationType:
            installationType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }

      props.onAutoUpdaterResult({
        version: latestVersion,
        status: installStatus,
      })
    }
  }

  // Initial check
  onMount(() => {
    void checkForUpdates()
  })

  // Check every 30 minutes
  let intervalId: ReturnType<typeof setInterval> | undefined
  onMount(() => {
    intervalId = setInterval(() => void checkForUpdates(), 30 * 60 * 1000)
  })
  // Note: onCleanup would clear the interval if supported

  return (
    <Show
      when={
        (props.autoUpdaterResult?.version || (versions().global && versions().latest)) &&
        (props.autoUpdaterResult?.version || props.isUpdating)
      }
    >
      <box flexDirection="row" gap={1}>
        <Show when={props.verbose}>
          <text dimmed wrap="truncate">
            globalVersion: {versions().global} &middot; latestVersion:{' '}
            {versions().latest}
          </text>
        </Show>
        <Show
          when={props.isUpdating}
          fallback={
            <Show
              when={
                props.autoUpdaterResult?.status === 'success' &&
                props.showSuccessMessage &&
                updateSemver
              }
            >
              <text fg="success" wrap="truncate">
                ✓ Update installed · Restart to apply
              </text>
            </Show>
          }
        >
          <box>
            <text fg="text" dimmed wrap="truncate">
              Auto-updating…
            </text>
          </box>
        </Show>
        <Show
          when={
            props.autoUpdaterResult?.status === 'install_failed' ||
            props.autoUpdaterResult?.status === 'no_permissions'
          }
        >
          <text fg="error" wrap="truncate">
            ✗ Auto-update failed &middot; Try <b>claude doctor</b> or{' '}
            <b>
              {hasLocalInstall()
                ? `cd ~/.claude/local && npm update ${MACRO.PACKAGE_URL}`
                : `npm i -g ${MACRO.PACKAGE_URL}`}
            </b>
          </text>
        </Show>
      </box>
    </Show>
  )
}
