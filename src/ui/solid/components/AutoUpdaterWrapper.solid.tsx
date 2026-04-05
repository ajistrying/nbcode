import { createSignal, onMount } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import type { AutoUpdaterResult } from '../../../utils/autoUpdater.js'
import { isAutoUpdaterDisabled } from '../../../utils/config.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getCurrentInstallationType } from '../../../utils/doctorDiagnostic.js'
import { AutoUpdater } from '../../components/AutoUpdater.js'
import { NativeAutoUpdater } from '../../components/NativeAutoUpdater.js'
import { PackageManagerAutoUpdater } from '../../components/PackageManagerAutoUpdater.js'

type Props = {
  isUpdating: boolean
  onChangeIsUpdating: (isUpdating: boolean) => void
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void
  autoUpdaterResult: AutoUpdaterResult | null
  showSuccessMessage: boolean
  verbose: boolean
}

export function AutoUpdaterWrapper(props: Props): JSX.Element {
  const [useNativeInstaller, setUseNativeInstaller] = createSignal<boolean | null>(null)
  const [isPackageManager, setIsPackageManager] = createSignal<boolean | null>(null)

  onMount(async () => {
    if (
      feature('SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED') &&
      isAutoUpdaterDisabled()
    ) {
      logForDebugging(
        'AutoUpdaterWrapper: Skipping detection, auto-updates disabled',
      )
      return
    }

    const installationType = await getCurrentInstallationType()
    logForDebugging(
      `AutoUpdaterWrapper: Installation type: ${installationType}`,
    )
    setUseNativeInstaller(installationType === 'native')
    setIsPackageManager(installationType === 'package-manager')
  })

  return (
    <Show when={useNativeInstaller() !== null && isPackageManager() !== null}>
      <Show when={isPackageManager()}>
        <PackageManagerAutoUpdater
          verbose={props.verbose}
          onAutoUpdaterResult={props.onAutoUpdaterResult}
          autoUpdaterResult={props.autoUpdaterResult}
          isUpdating={props.isUpdating}
          onChangeIsUpdating={props.onChangeIsUpdating}
          showSuccessMessage={props.showSuccessMessage}
        />
      </Show>
      <Show when={!isPackageManager()}>
        {(() => {
          const Updater = useNativeInstaller() ? NativeAutoUpdater : AutoUpdater
          return (
            <Updater
              verbose={props.verbose}
              onAutoUpdaterResult={props.onAutoUpdaterResult}
              autoUpdaterResult={props.autoUpdaterResult}
              isUpdating={props.isUpdating}
              onChangeIsUpdating={props.onChangeIsUpdating}
              showSuccessMessage={props.showSuccessMessage}
            />
          )
        })()}
      </Show>
    </Show>
  )
}
