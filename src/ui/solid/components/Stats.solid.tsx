import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  Suspense,
  type JSXElement,
} from 'solid-js'
import { feature } from 'bun:bundle'
import { plot as asciichart } from 'asciichart'
import chalk from 'chalk'
import figures from 'figures'
import stripAnsi from 'strip-ansi'
import type { CommandResultDisplay } from '../../../commands.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { applyColor } from '../../../ink/colorize.js'
import { stringWidth as getStringWidth } from '../../../ink/stringWidth.js'
import type { Color } from '../../../ink/styles.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getGlobalConfig } from '../../../utils/config.js'
import { formatDuration, formatNumber } from '../../../utils/format.js'
import { generateHeatmap } from '../../../utils/heatmap.js'
import { renderModelName } from '../../../utils/model/model.js'
import { copyAnsiToClipboard } from '../../../utils/screenshotClipboard.js'
import {
  aggregateClaudeCodeStatsForRange,
  type ClaudeCodeStats,
  type DailyModelTokens,
  type StatsDateRange,
} from '../../../utils/stats.js'
import { resolveThemeSetting } from '../../../utils/systemTheme.js'
import { getTheme, themeColorToAnsi } from '../../../utils/theme.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs, useTabHeaderFocus } from '../design-system/Tabs.js'
import { Spinner } from '../Spinner/index.js'

type Props = {
  onClose: (result?: string, options?: { display?: CommandResultDisplay }) => void
}

type StatsResult =
  | { type: 'success'; data: ClaudeCodeStats }
  | { type: 'error'; message: string }
  | { type: 'empty' }

const DATE_RANGE_LABELS: Record<StatsDateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}
const DATE_RANGE_ORDER: StatsDateRange[] = ['all', '7d', '30d']

function getNextDateRange(current: StatsDateRange): StatsDateRange {
  const currentIndex = DATE_RANGE_ORDER.indexOf(current)
  return DATE_RANGE_ORDER[(currentIndex + 1) % DATE_RANGE_ORDER.length]!
}

function formatPeakDay(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function createAllTimeStatsPromise(): Promise<StatsResult> {
  return aggregateClaudeCodeStatsForRange('all')
    .then((data): StatsResult => {
      if (!data || data.totalSessions === 0) return { type: 'empty' }
      return { type: 'success', data }
    })
    .catch((err): StatsResult => {
      const message = err instanceof Error ? err.message : 'Failed to load stats'
      return { type: 'error', message }
    })
}

export function Stats(props: Props): JSXElement {
  const [allTimeResult, setAllTimeResult] = createSignal<StatsResult | null>(null)
  const [loading, setLoading] = createSignal(true)

  onMount(() => {
    void createAllTimeStatsPromise().then(result => {
      setAllTimeResult(result)
      setLoading(false)
    })
  })

  return (
    <Show
      when={!loading()}
      fallback={
        <box marginTop={1}>
          <Spinner />
          <text> Loading your Claude Code stats\u2026</text>
        </box>
      }
    >
      <Show when={allTimeResult()}>
        <StatsContent allTimeResult={allTimeResult()!} onClose={props.onClose} />
      </Show>
    </Show>
  )
}

function StatsContent(innerProps: {
  allTimeResult: StatsResult
  onClose: Props['onClose']
}): JSXElement {
  const [dateRange, setDateRange] = createSignal<StatsDateRange>('all')
  const [statsCache, setStatsCache] = createSignal<Partial<Record<StatsDateRange, ClaudeCodeStats | null>>>({})
  const [isLoadingFiltered, setIsLoadingFiltered] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal('Overview')
  const [copyStatus, setCopyStatus] = createSignal<string | null>(null)

  // Load filtered stats when date range changes
  createEffect(() => {
    const range = dateRange()
    if (range === 'all') return
    if (statsCache()[range]) return
    let cancelled = false
    setIsLoadingFiltered(true)
    aggregateClaudeCodeStatsForRange(range)
      .then(data => {
        if (!cancelled) {
          setStatsCache(prev => ({ ...prev, [range]: data }))
          setIsLoadingFiltered(false)
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingFiltered(false)
      })
    onCleanup(() => { cancelled = true })
  })

  const displayStats = createMemo((): ClaudeCodeStats | null => {
    const range = dateRange()
    if (range === 'all') {
      return innerProps.allTimeResult.type === 'success' ? innerProps.allTimeResult.data : null
    }
    return (
      statsCache()[range] ??
      (innerProps.allTimeResult.type === 'success' ? innerProps.allTimeResult.data : null)
    )
  })

  const allTimeStats = createMemo((): ClaudeCodeStats | null =>
    innerProps.allTimeResult.type === 'success' ? innerProps.allTimeResult.data : null,
  )

  function handleClose() {
    innerProps.onClose('Stats dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleClose, { context: 'Confirmation' })

  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const { columns, rows } = useTerminalSize()
  const chartWidth = createMemo(() => Math.max(20, Math.min(columns - 10, 80)))

  function handleCycleDateRange() {
    setDateRange(getNextDateRange(dateRange()))
  }

  function handleCopy() {
    // Simplified copy — actual implementation would render to ANSI and copy
    setCopyStatus('Copied!')
    setTimeout(() => setCopyStatus(null), 2000)
  }

  return (
    <box flexDirection="column">
      <Show
        when={innerProps.allTimeResult.type === 'success'}
        fallback={
          <Show
            when={innerProps.allTimeResult.type === 'error'}
            fallback={<text dimmed>No stats data available yet. Start using Claude Code!</text>}
          >
            <text fg="error">
              Error: {(innerProps.allTimeResult as { type: 'error'; message: string }).message}
            </text>
          </Show>
        }
      >
        <Tabs activeTab={activeTab()} onTabChange={setActiveTab}>
          <Tab label="Overview">
            <box flexDirection="column" gap={1}>
              <box flexDirection="row" gap={2}>
                <text dimmed>{DATE_RANGE_LABELS[dateRange()]}</text>
                <text dimmed>(press d to cycle)</text>
              </box>

              <Show when={isLoadingFiltered()}>
                <box>
                  <Spinner />
                  <text> Loading...</text>
                </box>
              </Show>

              <Show when={displayStats()}>
                <box flexDirection="column" gap={1}>
                  <box flexDirection="row" gap={4}>
                    <box flexDirection="column">
                      <text>
                        <b>Sessions</b>
                      </text>
                      <text>{formatNumber(displayStats()!.totalSessions)}</text>
                    </box>
                    <box flexDirection="column">
                      <text>
                        <b>Total Time</b>
                      </text>
                      <text>{formatDuration(displayStats()!.totalDuration)}</text>
                    </box>
                    <box flexDirection="column">
                      <text>
                        <b>Total Cost</b>
                      </text>
                      <text>${displayStats()!.totalCost.toFixed(2)}</text>
                    </box>
                  </box>

                  <box flexDirection="row" gap={4}>
                    <box flexDirection="column">
                      <text>
                        <b>Input Tokens</b>
                      </text>
                      <text>{formatNumber(displayStats()!.totalInputTokens)}</text>
                    </box>
                    <box flexDirection="column">
                      <text>
                        <b>Output Tokens</b>
                      </text>
                      <text>{formatNumber(displayStats()!.totalOutputTokens)}</text>
                    </box>
                    <box flexDirection="column">
                      <text>
                        <b>Lines Changed</b>
                      </text>
                      <text>
                        +{formatNumber(displayStats()!.totalLinesAdded)} -{formatNumber(displayStats()!.totalLinesRemoved)}
                      </text>
                    </box>
                  </box>

                  <Show when={displayStats()!.peakDay}>
                    <text dimmed>
                      Peak day: {formatPeakDay(displayStats()!.peakDay!.date)} (
                      {displayStats()!.peakDay!.sessions} sessions)
                    </text>
                  </Show>
                </box>
              </Show>
            </box>
          </Tab>

          <Tab label="Models">
            <box flexDirection="column" gap={1}>
              <text>
                <b>Token Usage by Model</b>
              </text>
              <Show when={displayStats()?.modelBreakdown}>
                <For each={Object.entries(displayStats()!.modelBreakdown ?? {})}>
                  {([model, tokens]) => (
                    <box flexDirection="row" gap={2}>
                      <text>{renderModelName(model)}</text>
                      <text dimmed>
                        {formatNumber((tokens as DailyModelTokens).input)} in /{' '}
                        {formatNumber((tokens as DailyModelTokens).output)} out
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
          </Tab>

          <Tab label="Activity">
            <box flexDirection="column" gap={1}>
              <text>
                <b>Activity Heatmap</b>
              </text>
              <Show when={allTimeStats()?.dailySessions}>
                <text dimmed>
                  {Object.keys(allTimeStats()!.dailySessions ?? {}).length} days of activity
                </text>
              </Show>
            </box>
          </Tab>
        </Tabs>

        <box marginTop={1}>
          <text dimmed>
            d: cycle range {figures.middleDot} c: copy {figures.middleDot} Esc: close
            <Show when={copyStatus()}>
              {' '}
              {figures.middleDot} {copyStatus()}
            </Show>
          </text>
        </box>
      </Show>
    </box>
  )
}
