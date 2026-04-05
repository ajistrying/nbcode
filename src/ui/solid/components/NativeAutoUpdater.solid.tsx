import type { JSX } from '@opentui/solid'
import { createEffect, createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import { logEvent } from '../../../services/analytics/index.js'
import { logForDebugging } from '../../../utils/debug.js'
import { logError } from '../../../utils/log.js'
import { useInterval } from 'usehooks-ts'
import { useUpdateNotification } from '../../../hooks/useUpdateNotification.js'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import { getMaxVersion, getMaxVersionMessage } from '../../../utils/autoUpdater.js'
import { isAutoUpdaterDisabled } from '../../../utils/config.js'
import { installLatest } from '../../../utils/nativeInstaller/index.js'
import { gt } from '../../../utils/semver.js'
import { getInitialSettings } from '../../../utils/settings/settings.js'

function getErrorType(errorMessage: string): string {
  if (errorMessage.includes('timeout')) return 'timeout'
  if (errorMessage.includes('Checksum mismatch')) return 'checksum_mismatch'
  if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) return 'not_found'
  if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) return 'permission_denied'
  if (errorMessage.includes('ENOSPC')) return 'disk_full'
  if (errorMessage.includes('npm')) return 'npm_error'
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND')
  ) return 'network_error'
  return 'unknown'
}

type Props = {
  isUpdating: boolean
  onChangeIsUpdating: (isUpdating: boolean) => void
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void
  autoUpdaterResult: AutoUpdaterResult | null
  showSuccessMessage: boolean
  verbose: boolean
}

export function NativeAutoUpdater(props: Props): JSX.Element {
  const [versions, setVersions] = createSignal<{
    current?: string | null
    latest?: string | null
  }>({})
  const [maxVersionIssue, setMaxVersionIssue] = createSignal<string | null>(null)
  const updateSemver = useUpdateNotification(props.autoUpdaterResult?.version)
  const channel = getInitialSettings()?.autoUpdatesChannel ?? 'latest'

  let isUpdatingRef = props.isUpdating

  createEffect(() => {
    isUpdatingRef = props.isUpdating
  })

  const checkForUpdates = async () => {
    if (isUpdatingRef) return

    if (
      "production" === 'test' ||
      "production" === 'development'
    ) {
      logForDebugging(
        'NativeAutoUpdater: Skipping update check in test/dev environment',
      )
      return
    }

    if (isAutoUpdaterDisabled()) return

    props.onChangeIsUpdating(true)
    const startTime = Date.now()
    logEvent('tengu_native_auto_updater_start', {})

    try {
      const maxVersion = await getMaxVersion()
      if (maxVersion && gt(MACRO.VERSION, maxVersion)) {
        const msg = await getMaxVersionMessage()
        setMaxVersionIssue(msg ?? 'affects your version')
      }

      const result = await installLatest(channel)
      const currentVersion = MACRO.VERSION
      const latencyMs = Date.now() - startTime

      if (result.lockFailed) {
        logEvent('tengu_native_auto_updater_lock_contention', {
          latency_ms: latencyMs,
        })
        return
      }

      setVersions({ current: currentVersion, latest: result.latestVersion })

      if (result.wasUpdated) {
        logEvent('tengu_native_auto_updater_success', {
          latency_ms: latencyMs,
        })
        props.onAutoUpdaterResult({
          version: result.latestVersion,
          status: 'success',
        })
      } else {
        logEvent('tengu_native_auto_updater_up_to_date', {
          latency_ms: latencyMs,
        })
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logError(error)

      const errorType = getErrorType(errorMessage)
      logEvent('tengu_native_auto_updater_fail', {
        latency_ms: latencyMs,
        error_timeout: errorType === 'timeout',
        error_checksum: errorType === 'checksum_mismatch',
        error_not_found: errorType === 'not_found',
        error_permission: errorType === 'permission_denied',
        error_disk_full: errorType === 'disk_full',
        error_npm: errorType === 'npm_error',
        error_network: errorType === 'network_error',
      })

      props.onAutoUpdaterResult({
        version: null,
        status: 'install_failed',
      })
    } finally {
      props.onChangeIsUpdating(false)
    }
  }

  onMount(() => {
    void checkForUpdates()
  })

  useInterval(checkForUpdates, 30 * 60 * 1000)

  const hasUpdateResult = () => !!props.autoUpdaterResult?.version
  const hasVersionInfo = () => !!versions().current && !!versions().latest
  const shouldRender = () =>
    !!maxVersionIssue() || hasUpdateResult() || (props.isUpdating && hasVersionInfo())

  return (
    <Show when={shouldRender()}>
      <box flexDirection="row" gap={1}>
        <Show when={props.verbose}>
          <text dimmed>
            current: {versions().current} &middot; {channel}: {versions().latest}
          </text>
        </Show>
        <Show
          when={!props.isUpdating}
          fallback={
            <box>
              <text dimmed>Checking for updates</text>
            </box>
          }
        >
          <Show when={props.autoUpdaterResult?.status === 'success' && props.showSuccessMessage && updateSemver}>
            <text fg="success">
              {'\u2713'} Update installed {'\u00B7'} Restart to update
            </text>
          </Show>
        </Show>
        <Show when={props.autoUpdaterResult?.status === 'install_failed'}>
          <text fg="error">
            {'\u2717'} Auto-update failed &middot; Try <b>/status</b>
          </text>
        </Show>
        <Show when={maxVersionIssue() && "external" === 'ant'}>
          <text fg="warning">
            {'\u26A0'} Known issue: {maxVersionIssue()} &middot; Run{' '}
            <b>claude rollback --safe</b> to downgrade
          </text>
        </Show>
      </box>
    </Show>
  )
}
