/**
 * LogoV2 barrel export for SolidJS + OpenTUI.
 *
 * These components mirror the React LogoV2 at
 * src/components/LogoV2/ but use SolidJS reactivity
 * and OpenTUI rendering.
 */

export { Clawd, type ClawdPose } from './Clawd.solid.js'
export { Feed, calculateFeedWidth, type FeedConfig, type FeedLine } from './Feed.solid.js'
export { FeedColumn } from './FeedColumn.solid.js'
export {
  createRecentActivityFeed,
  createWhatsNewFeed,
  createProjectOnboardingFeed,
  createGuestPassesFeed,
} from './feedConfigs.solid.js'
export { WelcomeV2 } from './WelcomeV2.solid.js'

// Ported batch (AnimatedAsterisk, AnimatedClawd, ChannelsNotice, etc.)
export { AnimatedAsterisk } from './AnimatedAsterisk.solid.js'
export { AnimatedClawd } from './AnimatedClawd.solid.js'
export { ChannelsNotice } from './ChannelsNotice.solid.js'
export { CondensedLogo } from './CondensedLogo.solid.js'
export { EmergencyTip } from './EmergencyTip.solid.js'
export {
  GuestPassesUpsell,
  useShowGuestPassesUpsell,
  incrementGuestPassesSeenCount,
} from './GuestPassesUpsell.solid.js'
export {
  Opus1mMergeNotice,
  shouldShowOpus1mMergeNotice,
} from './Opus1mMergeNotice.solid.js'
export {
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
  incrementOverageCreditUpsellSeenCount,
  isEligibleForOverageCreditGrant,
  shouldShowOverageCreditUpsell,
  maybeRefreshOverageCreditCache,
  overageCreditFeedConfig,
} from './OverageCreditUpsell.solid.js'
export { VoiceModeNotice } from './VoiceModeNotice.solid.js'

// LogoV2 main
export { LogoV2 } from './LogoV2.solid.js'
