import { createEffect } from 'solid-js'
import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import { useAppState } from '../../../state/AppState.js'
import { getEffortSuffix } from '../../../utils/effort.js'
import { truncate } from '../../../utils/format.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import { formatModelAndBilling, getLogoDisplayData, truncatePath } from '../../../utils/logoV2Utils.js'
import { renderModelSetting } from '../../../utils/model/model.js'
import { OffscreenFreeze } from '../../components/OffscreenFreeze.solid.js'
import { AnimatedClawd } from './AnimatedClawd.solid.js'
import { Clawd } from './Clawd.js'
import { GuestPassesUpsell, incrementGuestPassesSeenCount, useShowGuestPassesUpsell } from './GuestPassesUpsell.solid.js'
import { incrementOverageCreditUpsellSeenCount, OverageCreditUpsell, useShowOverageCreditUpsell } from './OverageCreditUpsell.solid.js'

export function CondensedLogo(): JSX.Element {
  const { columns } = useTerminalSize()
  const agent = useAppState((s: any) => s.agent)
  const effortValue = useAppState((s: any) => s.effortValue)
  const model = useMainLoopModel()
  const modelDisplayName = renderModelSetting(model)
  const {
    version,
    cwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  const agentName = agent ?? agentNameFromSettings
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()

  createEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount()
    }
  })

  createEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount()
    }
  })

  const textWidth = () => Math.max(columns - 15, 20)
  const truncatedVersion = () => truncate(version, Math.max(textWidth() - 13, 6))
  const effortSuffix = () => getEffortSuffix(model, effortValue)
  const modelBilling = () =>
    formatModelAndBilling(modelDisplayName + effortSuffix(), billingType, textWidth())
  const cwdAvailableWidth = () =>
    agentName ? textWidth() - 1 - stringWidth(agentName) - 3 : textWidth()
  const truncatedCwd = () => truncatePath(cwd, Math.max(cwdAvailableWidth(), 10))

  const clawdElement = isFullscreenEnvEnabled() ? <AnimatedClawd /> : <Clawd />
  const cwdDisplay = () => (agentName ? `@${agentName} · ${truncatedCwd()}` : truncatedCwd())

  return (
    <OffscreenFreeze>
      <box flexDirection="row" gap={2} alignItems="center">
        {clawdElement}
        <box flexDirection="column">
          <text>
            <text><b>Noble Base Code</b></text>{' '}
            <text dimmed>v{truncatedVersion()}</text>
          </text>
          <Show
            when={modelBilling().shouldSplit}
            fallback={
              <text dimmed>{modelBilling().truncatedModel} · {modelBilling().truncatedBilling}</text>
            }
          >
            <text dimmed>{modelBilling().truncatedModel}</text>
            <text dimmed>{modelBilling().truncatedBilling}</text>
          </Show>
          <text dimmed>{cwdDisplay()}</text>
          <Show when={showGuestPassesUpsell}>
            <GuestPassesUpsell />
          </Show>
          <Show when={!showGuestPassesUpsell && showOverageCreditUpsell}>
            <OverageCreditUpsell maxWidth={textWidth()} twoLine={true} />
          </Show>
        </box>
      </box>
    </OffscreenFreeze>
  )
}
