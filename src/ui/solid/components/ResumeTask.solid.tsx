/**
 * ResumeTask — SolidJS port of src/components/ResumeTask.tsx
 *
 * Shows a list of recent Claude Code sessions to resume, with
 * loading/error/empty states and repo-based filtering.
 */
import { createSignal, createEffect, onMount, Show, For, type JSX } from 'solid-js'
import {
  type CodeSession,
  fetchCodeSessionsFromSessionsAPI,
} from 'src/utils/teleport/api.js'
import { logForDebugging } from '../../../utils/debug.js'
import { detectCurrentRepository } from '../../../utils/detectRepository.js'
import { formatRelativeTime } from '../../../utils/format.js'

type ResumeTaskProps = {
  onSelect: (session: CodeSession) => void
  onCancel: () => void
  isEmbedded?: boolean
  // Injected (replaces React hooks):
  rows: number
}

type LoadErrorType = 'network' | 'auth' | 'api' | 'other'

const UPDATED_STRING = 'Updated'
const SPACE_BETWEEN_TABLE_COLUMNS = '  '

function determineErrorType(errorMessage: string): LoadErrorType {
  const message = errorMessage.toLowerCase()
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout'))
    return 'network'
  if (
    message.includes('auth') ||
    message.includes('token') ||
    message.includes('permission') ||
    message.includes('oauth') ||
    message.includes('not authenticated') ||
    message.includes('/login') ||
    message.includes('console account') ||
    message.includes('403')
  )
    return 'auth'
  if (
    message.includes('api') ||
    message.includes('rate limit') ||
    message.includes('500') ||
    message.includes('529')
  )
    return 'api'
  return 'other'
}

function renderErrorSpecificGuidance(errorType: LoadErrorType): JSX.Element {
  switch (errorType) {
    case 'network':
      return (
        <box marginY={1} flexDirection="column">
          <text dimmed>Check your internet connection</text>
        </box>
      )
    case 'auth':
      return (
        <box marginY={1} flexDirection="column">
          <text dimmed>Teleport requires a Claude account</text>
          <text dimmed>
            Run <b>/login</b> and select "Claude account with subscription"
          </text>
        </box>
      )
    case 'api':
      return (
        <box marginY={1} flexDirection="column">
          <text dimmed>Sorry, Claude encountered an error</text>
        </box>
      )
    case 'other':
      return (
        <box marginY={1} flexDirection="row">
          <text dimmed>Sorry, Claude Code encountered an error</text>
        </box>
      )
  }
}

export function ResumeTask(props: ResumeTaskProps): JSX.Element {
  const isEmbedded = () => props.isEmbedded ?? false

  const [sessions, setSessions] = createSignal<CodeSession[]>([])
  const [currentRepo, setCurrentRepo] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [loadErrorType, setLoadErrorType] = createSignal<LoadErrorType | null>(null)
  const [retrying, setRetrying] = createSignal(false)
  const [hasCompletedTeleportErrorFlow, setHasCompletedTeleportErrorFlow] = createSignal(false)
  const [focusedIndex, setFocusedIndex] = createSignal(1)

  async function loadSessions() {
    try {
      setLoading(true)
      setLoadErrorType(null)

      const detectedRepo = await detectCurrentRepository()
      setCurrentRepo(detectedRepo)
      logForDebugging(`Current repository: ${detectedRepo || 'not detected'}`)

      const codeSessions = await fetchCodeSessionsFromSessionsAPI()

      let filteredSessions = codeSessions
      if (detectedRepo) {
        filteredSessions = codeSessions.filter((session) => {
          if (!session.repo) return false
          const sessionRepo = `${session.repo.owner.login}/${session.repo.name}`
          return sessionRepo === detectedRepo
        })
        logForDebugging(
          `Filtered ${filteredSessions.length} sessions for repo ${detectedRepo} from ${codeSessions.length} total`,
        )
      }

      const sortedSessions = [...filteredSessions].sort((a, b) => {
        const dateA = new Date(a.updated_at)
        const dateB = new Date(b.updated_at)
        return dateB.getTime() - dateA.getTime()
      })

      setSessions(sortedSessions)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logForDebugging(`Error loading code sessions: ${errorMessage}`)
      setLoadErrorType(determineErrorType(errorMessage))
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }

  function handleRetry() {
    setRetrying(true)
    void loadSessions()
  }

  function handleErrorComplete() {
    setHasCompletedTeleportErrorFlow(true)
    void loadSessions()
  }

  // Show error dialog first
  const showTeleportError = () => !hasCompletedTeleportErrorFlow()

  // Session metadata
  const sessionMetadata = () =>
    sessions().map((session) => ({
      ...session,
      timeString: formatRelativeTime(new Date(session.updated_at)),
    }))

  const maxTimeStringLength = () =>
    Math.max(
      UPDATED_STRING.length,
      ...sessionMetadata().map((meta) => meta.timeString.length),
    )

  const options = () =>
    sessionMetadata().map(({ timeString, title, id }) => ({
      label: `${timeString.padEnd(maxTimeStringLength(), ' ')}  ${title}`,
      value: id,
    }))

  const layoutOverhead = 7
  const maxVisibleOptions = () =>
    Math.max(
      1,
      isEmbedded()
        ? Math.min(sessions().length, 5, props.rows - 6 - layoutOverhead)
        : Math.min(sessions().length, props.rows - 1 - layoutOverhead),
    )

  const showScrollPosition = () => sessions().length > maxVisibleOptions()

  return (
    <Show when={!showTeleportError()} fallback={<text>Checking teleport status...</text>}>
      {/* Loading state */}
      <Show when={loading()}>
        <box flexDirection="column" padding={1}>
          <text>
            <b>Loading Claude Code sessions\u2026</b>
          </text>
          <text dimmed>{retrying() ? 'Retrying\u2026' : 'Fetching your Claude Code sessions\u2026'}</text>
        </box>
      </Show>

      {/* Error state */}
      <Show when={!loading() && loadErrorType()}>
        <box flexDirection="column" padding={1}>
          <text fg="red">
            <b>Error loading Claude Code sessions</b>
          </text>
          {renderErrorSpecificGuidance(loadErrorType()!)}
          <text dimmed>
            Press <b>Ctrl+R</b> to retry · Press <b>Esc</b> to cancel
          </text>
        </box>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && !loadErrorType() && sessions().length === 0}>
        <box flexDirection="column" padding={1}>
          <text>
            <b>
              No Claude Code sessions found
              <Show when={currentRepo()}>
                <text> for {currentRepo()}</text>
              </Show>
            </b>
          </text>
          <box marginTop={1}>
            <text dimmed>
              Press <b>Esc</b> to cancel
            </text>
          </box>
        </box>
      </Show>

      {/* Sessions list */}
      <Show when={!loading() && !loadErrorType() && sessions().length > 0}>
        <box flexDirection="column" padding={1}>
          <text>
            <b>
              Select a session to resume
              <Show when={showScrollPosition()}>
                <text dimmed>
                  {' '}
                  ({focusedIndex()} of {sessions().length})
                </text>
              </Show>
              <Show when={currentRepo()}>
                <text dimmed> ({currentRepo()})</text>
              </Show>
              :
            </b>
          </text>
          <box flexDirection="column" marginTop={1} flexGrow={1}>
            {/* Table header */}
            <box marginLeft={2}>
              <text>
                <b>
                  {UPDATED_STRING.padEnd(maxTimeStringLength(), ' ')}
                  {SPACE_BETWEEN_TABLE_COLUMNS}
                  Session Title
                </b>
              </text>
            </box>
            {/* Session options */}
            <For each={options()}>
              {(opt, i) => (
                <text fg={i() + 1 === focusedIndex() ? 'cyan' : undefined}>
                  {opt.label}
                </text>
              )}
            </For>
          </box>
          <box flexDirection="row">
            <text dimmed>
              {'\u2191/\u2193 select · Enter confirm · Esc cancel'}
            </text>
          </box>
        </box>
      </Show>
    </Show>
  )
}
