/**
 * Feed configuration factory functions.
 *
 * SolidJS + OpenTUI port of src/components/LogoV2/feedConfigs.tsx.
 *
 * These are mostly pure business logic with minimal JSX.
 * The JSX that exists uses OpenTUI elements.
 */

import figures from 'figures'
import { homedir } from 'os'
import type { JSX } from '@opentui/solid'
import type { Step } from '../../../projectOnboardingState.js'
import {
  formatCreditAmount,
  getCachedReferrerReward,
} from '../../../services/api/referral.js'
import type { LogOption } from '../../../types/logs.js'
import { getCwd } from '../../../utils/cwd.js'
import { formatRelativeTimeAgo } from '../../../utils/format.js'
import type { FeedConfig, FeedLine } from './Feed.solid.js'

export function createRecentActivityFeed(activities: LogOption[]): FeedConfig {
  const lines: FeedLine[] = activities.map((log) => {
    const time = formatRelativeTimeAgo(log.modified)
    const description =
      log.summary && log.summary !== 'No prompt' ? log.summary : log.firstPrompt

    return {
      text: description || '',
      timestamp: time,
    }
  })

  return {
    title: 'Recent activity',
    lines,
    footer: lines.length > 0 ? '/resume for more' : undefined,
    emptyMessage: 'No recent activity',
  }
}

export function createWhatsNewFeed(releaseNotes: string[]): FeedConfig {
  const lines: FeedLine[] = releaseNotes.map((note) => {
    if ("external" === 'ant') {
      const match = note.match(/^(\d+\s+\w+\s+ago)\s+(.+)$/)
      if (match) {
        return {
          timestamp: match[1],
          text: match[2] || '',
        }
      }
    }
    return {
      text: note,
    }
  })

  const emptyMessage =
    "external" === 'ant'
      ? 'Unable to fetch latest claude-cli-internal commits'
      : 'Check the Noble Base Code changelog for updates'

  return {
    title:
      "external" === 'ant'
        ? "What's new [ANT-ONLY: Latest CC commits]"
        : "What's new",
    lines,
    footer: lines.length > 0 ? '/release-notes for more' : undefined,
    emptyMessage,
  }
}

export function createProjectOnboardingFeed(steps: Step[]): FeedConfig {
  const enabledSteps = steps
    .filter(({ isEnabled }) => isEnabled)
    .sort((a, b) => Number(a.isComplete) - Number(b.isComplete))

  const lines: FeedLine[] = enabledSteps.map(({ text, isComplete }) => {
    const checkmark = isComplete ? `${figures.tick} ` : ''
    return {
      text: `${checkmark}${text}`,
    }
  })

  const warningText =
    getCwd() === homedir()
      ? 'Note: You have launched claude in your home directory. For the best experience, launch it in a project directory instead.'
      : undefined

  if (warningText) {
    lines.push({
      text: warningText,
    })
  }

  return {
    title: 'Tips for getting started',
    lines,
  }
}

export function createGuestPassesFeed(): FeedConfig {
  const reward = getCachedReferrerReward()
  const subtitle = reward
    ? `Share Noble Base Code and earn ${formatCreditAmount(reward)} of extra usage`
    : 'Share Noble Base Code with friends'
  return {
    title: '3 guest passes',
    lines: [],
    customContent: {
      content: (
        <>
          <box marginY={1}>
            <text fg="startupAccent">[✻] [✻] [✻]</text>
          </box>
          <text dimmed>{subtitle}</text>
        </>
      ),
      width: 48,
    },
    footer: '/passes',
  }
}
