import { createSignal, createEffect, onMount, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth } from '../../../ink/stringWidth.js'
import {
  getLayoutMode,
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  formatWelcomeMessage,
  truncatePath,
  getRecentActivitySync,
  getRecentReleaseNotesSync,
  getLogoDisplayData,
} from '../../../utils/logoV2Utils.js'
import { truncate } from '../../../utils/format.js'
import { getDisplayPath } from '../../../utils/file.js'
import { Clawd } from './Clawd.solid.js'
import { FeedColumn } from './FeedColumn.solid.js'
import {
  createRecentActivityFeed,
  createWhatsNewFeed,
  createProjectOnboardingFeed,
  createGuestPassesFeed,
} from './feedConfigs.solid.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import { resolveThemeSetting } from 'src/utils/systemTheme.js'
import { getInitialSettings } from 'src/utils/settings/settings.js'
import {
  isDebugMode,
  isDebugToStdErr,
  getDebugLogPath,
} from 'src/utils/debug.js'
import {
  getSteps,
  shouldShowProjectOnboarding,
  incrementProjectOnboardingSeenCount,
} from '../../../projectOnboardingState.js'
import { CondensedLogo } from './CondensedLogo.solid.js'
import { OffscreenFreeze } from '../components/OffscreenFreeze.solid.js'
import { checkForReleaseNotesSync } from '../../../utils/releaseNotes.js'
import { getDumpPromptsPath } from 'src/services/api/dumpPrompts.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import {
  getStartupPerfLogPath,
  isDetailedProfilingEnabled,
} from 'src/utils/startupProfiler.js'
import { EmergencyTip } from './EmergencyTip.solid.js'
import { VoiceModeNotice } from './VoiceModeNotice.solid.js'
import { Opus1mMergeNotice } from './Opus1mMergeNotice.solid.js'
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import {
  useShowGuestPassesUpsell,
  incrementGuestPassesSeenCount,
} from './GuestPassesUpsell.solid.js'
import {
  useShowOverageCreditUpsell,
  incrementOverageCreditUpsellSeenCount,
  createOverageCreditFeed,
} from './OverageCreditUpsell.solid.js'
import { plural } from '../../../utils/stringUtils.js'
import { useAppState } from '../../../state/AppState.js'
import { getEffortSuffix } from '../../../utils/effort.js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { renderModelSetting } from '../../../utils/model/model.js'

const LEFT_PANEL_MAX_WIDTH = 50

export function LogoV2(): JSX.Element {
  const activities = getRecentActivitySync()
  const username = getGlobalConfig().oauthAccount?.displayName ?? ''

  const { columns } = useTerminalSize()
  const showOnboarding = shouldShowProjectOnboarding()
  const showSandboxStatus = SandboxManager.isSandboxingEnabled()
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)

  const config = getGlobalConfig()

  let changelog: string[]
  try {
    changelog = getRecentReleaseNotesSync(3)
  } catch {
    changelog = []
  }

  const [announcement] = createSignal(() => {
    const announcements = getInitialSettings().companyAnnouncements
    if (!announcements || announcements.length === 0) return undefined
    return config.numStartups === 1
      ? announcements[0]
      : announcements[Math.floor(Math.random() * announcements.length)]
  })

  const announcementValue = announcement()?.()

  const { hasReleaseNotes } = checkForReleaseNotesSync(
    config.lastReleaseNotesSeen,
  )

  createEffect(() => {
    const currentConfig = getGlobalConfig()
    if (currentConfig.lastReleaseNotesSeen === MACRO.VERSION) {
      return
    }
    saveGlobalConfig(current => {
      if (current.lastReleaseNotesSeen === MACRO.VERSION) return current
      return { ...current, lastReleaseNotesSeen: MACRO.VERSION }
    })
    if (showOnboarding) {
      incrementProjectOnboardingSeenCount()
    }
  })

  const isCondensedMode =
    !hasReleaseNotes &&
    !showOnboarding &&
    !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)

  createEffect(() => {
    if (showGuestPassesUpsell && !showOnboarding && !isCondensedMode) {
      incrementGuestPassesSeenCount()
    }
  })

  createEffect(() => {
    if (
      showOverageCreditUpsell &&
      !showOnboarding &&
      !showGuestPassesUpsell &&
      !isCondensedMode
    ) {
      incrementOverageCreditUpsellSeenCount()
    }
  })

  const model = useMainLoopModel()
  const fullModelDisplayName = renderModelSetting(model)
  const {
    version,
    cwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  const agentName = agent ?? agentNameFromSettings
  const effortSuffix = getEffortSuffix(model, effortValue)
  const modelDisplayName = truncate(
    fullModelDisplayName + effortSuffix,
    LEFT_PANEL_MAX_WIDTH - 20,
  )

  // Condensed mode
  if (isCondensedMode) {
    return (
      <>
        <CondensedLogo />
        <VoiceModeNotice />
        <Opus1mMergeNotice />
        <Show when={isDebugMode()}>
          <box paddingLeft={2} flexDirection="column">
            <text fg="warning">Debug mode enabled</text>
            <text dimmed>
              Logging to: {isDebugToStdErr() ? 'stderr' : getDebugLogPath()}
            </text>
          </box>
        </Show>
        <EmergencyTip />
        <Show when={process.env.CLAUDE_CODE_TMUX_SESSION}>
          <box paddingLeft={2} flexDirection="column">
            <text dimmed>
              tmux session: {process.env.CLAUDE_CODE_TMUX_SESSION}
            </text>
            <text dimmed>
              {process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS
                ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})`
                : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d`}
            </text>
          </box>
        </Show>
        <Show when={announcementValue}>
          <box paddingLeft={2} flexDirection="column">
            <Show when={!process.env.IS_DEMO && config.oauthAccount?.organizationName}>
              <text dimmed>
                Message from {config.oauthAccount?.organizationName}:
              </text>
            </Show>
            <text>{announcementValue}</text>
          </box>
        </Show>
      </>
    )
  }

  // Full layout
  const layoutMode = getLayoutMode(columns)
  const userTheme = resolveThemeSetting(getGlobalConfig().theme)

  if (layoutMode === 'compact') {
    const layoutWidth = 4
    let welcomeMessage = formatWelcomeMessage(username)
    if (stringWidth(welcomeMessage) > columns - layoutWidth) {
      welcomeMessage = formatWelcomeMessage(null)
    }

    const separator = ' · '
    const atPrefix = '@'
    const cwdAvailableWidth = agentName
      ? columns -
        layoutWidth -
        atPrefix.length -
        stringWidth(agentName) -
        separator.length
      : columns - layoutWidth
    const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))

    return (
      <>
        <OffscreenFreeze>
          <box
            flexDirection="column"
            borderStyle="round"
            borderColor="claude"
            paddingX={1}
            paddingY={1}
            alignItems="center"
            width={columns}
          >
            <text><b>{welcomeMessage}</b></text>
            <box marginY={1}>
              <Clawd />
            </box>
            <text dimmed>{modelDisplayName}</text>
            <text dimmed>{billingType}</text>
            <text dimmed>
              {agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}
            </text>
          </box>
        </OffscreenFreeze>
        <VoiceModeNotice />
        <Opus1mMergeNotice />
        <Show when={showSandboxStatus}>
          <box marginTop={1} flexDirection="column">
            <text fg="warning">
              Your bash commands will be sandboxed. Disable with /sandbox.
            </text>
          </box>
        </Show>
      </>
    )
  }

  // Horizontal / vertical layout
  const welcomeMessage = formatWelcomeMessage(username)
  const modelLine =
    !process.env.IS_DEMO && config.oauthAccount?.organizationName
      ? `${modelDisplayName} · ${billingType} · ${config.oauthAccount.organizationName}`
      : `${modelDisplayName} · ${billingType}`

  const cwdSeparator = ' · '
  const cwdAtPrefix = '@'
  const cwdAvailableWidth = agentName
    ? LEFT_PANEL_MAX_WIDTH -
      cwdAtPrefix.length -
      stringWidth(agentName) -
      cwdSeparator.length
    : LEFT_PANEL_MAX_WIDTH
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))
  const cwdLine = agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd
  const optimalLeftWidth = calculateOptimalLeftWidth(
    welcomeMessage,
    cwdLine,
    modelLine,
  )

  const { leftWidth, rightWidth } = calculateLayoutDimensions(
    columns,
    layoutMode,
    optimalLeftWidth,
  )

  return (
    <>
      <OffscreenFreeze>
        <box
          flexDirection="column"
          borderStyle="round"
          borderColor="claude"
        >
          <box
            flexDirection={layoutMode === 'horizontal' ? 'row' : 'column'}
            paddingX={1}
            gap={1}
          >
            {/* Left Panel */}
            <box
              flexDirection="column"
              width={leftWidth}
              justifyContent="space-between"
              alignItems="center"
              minHeight={9}
            >
              <box marginTop={1}>
                <text><b>{welcomeMessage}</b></text>
              </box>

              <Clawd />

              <box flexDirection="column" alignItems="center">
                <text dimmed>{modelLine}</text>
                <text dimmed>{cwdLine}</text>
              </box>
            </box>

            {/* Vertical divider */}
            <Show when={layoutMode === 'horizontal'}>
              <box
                height="100%"
                borderStyle="single"
                borderColor="claude"
                borderDimColor
                borderTop={false}
                borderBottom={false}
                borderLeft={false}
              />
            </Show>

            {/* Right Panel */}
            <Show when={layoutMode === 'horizontal'}>
              <FeedColumn
                feeds={
                  showOnboarding
                    ? [
                        createProjectOnboardingFeed(getSteps()),
                        createRecentActivityFeed(activities),
                      ]
                    : showGuestPassesUpsell
                      ? [
                          createRecentActivityFeed(activities),
                          createGuestPassesFeed(),
                        ]
                      : showOverageCreditUpsell
                        ? [
                            createRecentActivityFeed(activities),
                            createOverageCreditFeed(),
                          ]
                        : [
                            createRecentActivityFeed(activities),
                            createWhatsNewFeed(changelog),
                          ]
                }
                maxWidth={rightWidth}
              />
            </Show>
          </box>
        </box>
      </OffscreenFreeze>
      <VoiceModeNotice />
      <Opus1mMergeNotice />
      <Show when={isDebugMode()}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="warning">Debug mode enabled</text>
          <text dimmed>
            Logging to: {isDebugToStdErr() ? 'stderr' : getDebugLogPath()}
          </text>
        </box>
      </Show>
      <EmergencyTip />
      <Show when={process.env.CLAUDE_CODE_TMUX_SESSION}>
        <box paddingLeft={2} flexDirection="column">
          <text dimmed>
            tmux session: {process.env.CLAUDE_CODE_TMUX_SESSION}
          </text>
          <text dimmed>
            {process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS
              ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})`
              : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d`}
          </text>
        </box>
      </Show>
      <Show when={announcementValue}>
        <box paddingLeft={2} flexDirection="column">
          <Show when={!process.env.IS_DEMO && config.oauthAccount?.organizationName}>
            <text dimmed>
              Message from {config.oauthAccount?.organizationName}:
            </text>
          </Show>
          <text>{announcementValue}</text>
        </box>
      </Show>
      <Show when={showSandboxStatus}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="warning">
            Your bash commands will be sandboxed. Disable with /sandbox.
          </text>
        </box>
      </Show>
    </>
  )
}
