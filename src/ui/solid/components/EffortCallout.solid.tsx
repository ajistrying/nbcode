import { onMount, onCleanup, type JSX } from 'solid-js'
import {
  isMaxSubscriber,
  isProSubscriber,
  isTeamSubscriber,
} from '../../../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import type { EffortLevel } from '../../../utils/effort.js'
import {
  convertEffortValueToLevel,
  getDefaultEffortForModel,
  getOpusDefaultEffortConfig,
  toPersistableEffort,
} from '../../../utils/effort.js'
import { parseUserSpecifiedModel } from '../../../utils/model/model.js'
import { updateSettingsForSource } from '../../../utils/settings/settings.js'
import type { OptionWithDescription } from '../../components/CustomSelect/select.js'
import { Select } from '../../components/CustomSelect/select.js'
import { effortLevelToSymbol } from '../../components/EffortIndicator.js'
import { PermissionDialog } from '../permissions/PermissionDialog.solid.js'

type EffortCalloutSelection = EffortLevel | undefined | 'dismiss'

type Props = {
  model: string
  onDone: (selection: EffortCalloutSelection) => void
}

const AUTO_DISMISS_MS = 30_000

export function EffortCallout(props: Props): JSX.Element {
  const defaultEffortConfig = getOpusDefaultEffortConfig()

  // Latest-ref pattern
  let onDoneRef = props.onDone

  const handleCancel = (): void => {
    onDoneRef('dismiss')
  }

  // Permanently dismiss on mount so it only shows once
  onMount(() => {
    markV2Dismissed()
  })

  // 30-second auto-dismiss timer
  let timeoutId: ReturnType<typeof setTimeout>
  onMount(() => {
    timeoutId = setTimeout(handleCancel, AUTO_DISMISS_MS)
  })
  onCleanup(() => clearTimeout(timeoutId))

  const defaultEffort = getDefaultEffortForModel(props.model)
  const defaultLevel = defaultEffort
    ? convertEffortValueToLevel(defaultEffort)
    : 'high'

  const handleSelect = (value: EffortLevel): void => {
    const effortLevel = value === defaultLevel ? undefined : value
    updateSettingsForSource('userSettings', {
      effortLevel: toPersistableEffort(effortLevel),
    })
    onDoneRef(value)
  }

  const options: OptionWithDescription<EffortLevel>[] = [
    {
      label: (<EffortOptionLabel level="medium" text="Medium (recommended)" />) as unknown as string,
      value: 'medium',
    },
    { label: (<EffortOptionLabel level="high" text="High" />) as unknown as string, value: 'high' },
    { label: (<EffortOptionLabel level="low" text="Low" />) as unknown as string, value: 'low' },
  ]

  return (
    <PermissionDialog title={defaultEffortConfig.dialogTitle}>
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <box marginBottom={1} flexDirection="column">
          <text>{defaultEffortConfig.dialogDescription}</text>
        </box>
        <box marginBottom={1}>
          <text dimmed>
            <EffortIndicatorSymbol level="low" /> low {'·'}{' '}
            <EffortIndicatorSymbol level="medium" /> medium {'·'}{' '}
            <EffortIndicatorSymbol level="high" /> high
          </text>
        </box>
        <Select
          options={options}
          onChange={handleSelect}
          onCancel={handleCancel}
        />
      </box>
    </PermissionDialog>
  )
}

function EffortIndicatorSymbol(props: {
  level: EffortLevel
}): JSX.Element {
  return <text fg="suggestion">{effortLevelToSymbol(props.level)}</text>
}

function EffortOptionLabel(props: {
  level: EffortLevel
  text: string
}): JSX.Element {
  return (
    <>
      <EffortIndicatorSymbol level={props.level} /> {props.text}
    </>
  )
}

/**
 * Check whether to show the effort callout.
 */
export function shouldShowEffortCallout(model: string): boolean {
  const parsed = parseUserSpecifiedModel(model)
  if (!parsed.toLowerCase().includes('opus-4-6')) {
    return false
  }

  const config = getGlobalConfig()
  if (config.effortCalloutV2Dismissed) return false

  if (config.numStartups <= 1) {
    markV2Dismissed()
    return false
  }

  if (isProSubscriber()) {
    if (config.effortCalloutDismissed) {
      markV2Dismissed()
      return false
    }
    return getOpusDefaultEffortConfig().enabled
  }

  if (isMaxSubscriber() || isTeamSubscriber()) {
    return getOpusDefaultEffortConfig().enabled
  }

  markV2Dismissed()
  return false
}

function markV2Dismissed(): void {
  saveGlobalConfig(current => {
    if (current.effortCalloutV2Dismissed) return current
    return { ...current, effortCalloutV2Dismissed: true }
  })
}
