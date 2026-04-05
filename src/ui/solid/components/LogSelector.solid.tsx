import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
  type JSXElement,
} from 'solid-js'
import chalk from 'chalk'
import figures from 'figures'
import Fuse from 'fuse.js'
import { getOriginalCwd, getSessionId } from '../../../bootstrap/state.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useSearchInput } from '../../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { applyColor } from '../../../ink/colorize.js'
import type { Color } from '../../../ink/styles.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { logEvent } from '../../../services/analytics/index.js'
import type { LogOption, SerializedMessage } from '../../../types/logs.js'
import { formatLogMetadata, truncateToWidth } from '../../../utils/format.js'
import { getWorktreePaths } from '../../../utils/getWorktreePaths.js'
import { getBranch } from '../../../utils/git.js'
import { getLogDisplayTitle } from '../../../utils/log.js'
import {
  getFirstMeaningfulUserMessageTextContent,
  getSessionIdFromLog,
  isCustomTitleEnabled,
  saveCustomTitle,
} from '../../../utils/sessionStorage.js'
import { getTheme } from '../../../utils/theme.js'
import { ConfigurableShortcutHint } from '../design-system/ConfigurableShortcutHint.js'
import { Select } from '../components/CustomSelect/select.js'
import { Byline } from '../design-system/Byline.js'
import { Divider } from '../design-system/Divider.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { SearchBox } from '../components/SearchBox.solid.js'
import { SessionPreview } from '../components/SessionPreview.solid.js'
import { Spinner } from '../Spinner/index.js'
import { TagTabs } from '../components/TagTabs.solid.js'
import TextInput from '../components/TextInput.solid.js'
import { type TreeNode, TreeSelect } from '../components/TreeSelect.solid.js'

type AgenticSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; results: LogOption[]; query: string }
  | { status: 'error'; message: string }

export type LogSelectorProps = {
  logs: LogOption[]
  maxHeight?: number
  forceWidth?: number
  onCancel?: () => void
  onSelect: (log: LogOption) => void
  onLogsChanged?: () => void
  onLoadMore?: (count: number) => void
  initialSearchQuery?: string
  showAllProjects?: boolean
  onToggleAllProjects?: () => void
  onAgenticSearch?: (
    query: string,
    logs: LogOption[],
    signal?: AbortSignal,
  ) => Promise<LogOption[]>
}

type LogTreeNode = TreeNode<{ log: LogOption; indexInFiltered: number }>

// Width of prefixes that TreeSelect will add
const PARENT_PREFIX_WIDTH = 2
const CHILD_PREFIX_WIDTH = 4
const DEEP_SEARCH_MAX_MESSAGES = 2000
const DEEP_SEARCH_CROP_SIZE = 1000
const DEEP_SEARCH_MAX_TEXT_LENGTH = 50000
const FUSE_THRESHOLD = 0.3
const DATE_TIE_THRESHOLD_MS = 60 * 1000
const SNIPPET_CONTEXT_CHARS = 50

type Snippet = { before: string; match: string; after: string }

function formatSnippet(
  { before, match, after }: Snippet,
  highlightColor: (text: string) => string,
): string {
  return chalk.dim(before) + highlightColor(match) + chalk.dim(after)
}

function extractSnippet(text: string, query: string, contextChars: number): Snippet | null {
  const matchIndex = text.toLowerCase().indexOf(query.toLowerCase())
  if (matchIndex === -1) return null
  const matchEnd = matchIndex + query.length
  const snippetStart = Math.max(0, matchIndex - contextChars)
  const snippetEnd = Math.min(text.length, matchEnd + contextChars)
  return {
    before:
      (snippetStart > 0 ? '\u2026' : '') +
      text
        .slice(snippetStart, matchIndex)
        .replace(/\s+/g, ' ')
        .trimStart(),
    match: text.slice(matchIndex, matchEnd).trim(),
    after:
      text
        .slice(matchEnd, snippetEnd)
        .replace(/\s+/g, ' ')
        .trimEnd() + (snippetEnd < text.length ? '\u2026' : ''),
  }
}

function normalizeAndTruncateToWidth(text: string, maxWidth: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return truncateToWidth(normalized, maxWidth)
}

function buildLogLabel(
  log: LogOption,
  maxLabelWidth: number,
  options?: { isGroupHeader?: boolean; isChild?: boolean; forkCount?: number },
): string {
  const { isGroupHeader = false, isChild = false, forkCount = 0 } = options || {}
  const prefixWidth =
    isGroupHeader && forkCount > 0 ? PARENT_PREFIX_WIDTH : isChild ? CHILD_PREFIX_WIDTH : 0
  const sessionCountSuffix =
    isGroupHeader && forkCount > 0
      ? ` (+${forkCount} other ${forkCount === 1 ? 'session' : 'sessions'})`
      : ''
  const sidechainSuffix = log.isSidechain ? ' (sidechain)' : ''
  const maxSummaryWidth =
    maxLabelWidth - prefixWidth - sidechainSuffix.length - sessionCountSuffix.length
  const truncatedSummary = normalizeAndTruncateToWidth(getLogDisplayTitle(log), maxSummaryWidth)
  return `${truncatedSummary}${sidechainSuffix}${sessionCountSuffix}`
}

function buildLogMetadata(
  log: LogOption,
  options?: { isChild?: boolean; showProjectPath?: boolean },
): string {
  const { isChild = false, showProjectPath = false } = options || {}
  const childPadding = isChild ? '    ' : ''
  const baseMetadata = formatLogMetadata(log)
  const projectSuffix = showProjectPath && log.projectPath ? ` \u00b7 ${log.projectPath}` : ''
  return childPadding + baseMetadata + projectSuffix
}

export function LogSelector(props: LogSelectorProps): JSXElement {
  const maxHeight = () => props.maxHeight ?? Infinity
  const showAllProjects = () => props.showAllProjects ?? false
  const terminalSize = useTerminalSize()
  const columns = () => (props.forceWidth ?? terminalSize.columns)
  const exitState = useExitOnCtrlCDWithKeybindings(props.onCancel)
  const isResumeWithRenameEnabled = isCustomTitleEnabled()

  const [currentBranch, setCurrentBranch] = createSignal<string | null>(null)
  const [branchFilterEnabled, setBranchFilterEnabled] = createSignal(false)
  const [showAllWorktrees, setShowAllWorktrees] = createSignal(false)
  const [hasMultipleWorktrees, setHasMultipleWorktrees] = createSignal(false)

  const originalCwd = getOriginalCwd()
  const currentSessionId = getSessionId()

  // Load branch info on mount
  onMount(() => {
    void getBranch(originalCwd).then(branch => setCurrentBranch(branch ?? null))
    void getWorktreePaths(originalCwd).then(paths => setHasMultipleWorktrees(paths.length > 1))
  })

  // Search state
  const [searchQuery, setSearchQuery] = createSignal(props.initialSearchQuery ?? '')
  const [selectedLogIndex, setSelectedLogIndex] = createSignal(0)
  const [previewLog, setPreviewLog] = createSignal<LogOption | null>(null)
  const [isRenaming, setIsRenaming] = createSignal(false)
  const [renameValue, setRenameValue] = createSignal('')
  const [agenticSearch, setAgenticSearch] = createSignal<AgenticSearchState>({ status: 'idle' })

  // Filter logs
  const filteredLogs = createMemo(() => {
    let logs = props.logs

    // Filter out current session
    logs = logs.filter(l => getSessionIdFromLog(l) !== currentSessionId)

    // Branch filter
    if (branchFilterEnabled() && currentBranch()) {
      logs = logs.filter(l => l.branch === currentBranch())
    }

    // Search filter
    const query = searchQuery().toLowerCase().trim()
    if (query) {
      const fuse = new Fuse(logs, {
        keys: ['title', 'summary'],
        threshold: FUSE_THRESHOLD,
        includeScore: true,
      })
      const results = fuse.search(query)
      logs = results.map(r => r.item)
    }

    return logs
  })

  // Build tree nodes from filtered logs
  const treeNodes = createMemo((): LogTreeNode[] => {
    const maxLabelWidth = columns() - 6
    return filteredLogs().map((log, index) => ({
      label: buildLogLabel(log, maxLabelWidth),
      metadata: buildLogMetadata(log, { showProjectPath: showAllProjects() }),
      value: { log, indexInFiltered: index },
      children: [],
    }))
  })

  // Clamp selection
  createEffect(() => {
    const max = filteredLogs().length - 1
    if (selectedLogIndex() > max) setSelectedLogIndex(Math.max(0, max))
  })

  function handleSelect(node: LogTreeNode) {
    props.onSelect(node.value.log)
  }

  function handleRename(log: LogOption) {
    setIsRenaming(true)
    setRenameValue(getLogDisplayTitle(log))
  }

  function handleRenameSave() {
    const log = filteredLogs()[selectedLogIndex()]
    if (log) {
      const sessionId = getSessionIdFromLog(log)
      if (sessionId) {
        saveCustomTitle(sessionId, renameValue())
        props.onLogsChanged?.()
      }
    }
    setIsRenaming(false)
  }

  useKeybinding(
    'confirm:no',
    () => {
      if (isRenaming()) {
        setIsRenaming(false)
        return
      }
      if (previewLog()) {
        setPreviewLog(null)
        return
      }
      props.onCancel?.()
    },
    { context: 'Confirmation' },
  )

  return (
    <box flexDirection="column">
      <Divider title="Resume a conversation" />

      {/* Search bar */}
      <box flexDirection="row" gap={1} marginBottom={1}>
        <SearchBox
          value={searchQuery()}
          onChange={setSearchQuery}
          placeholder="Search sessions..."
          isActive={!isRenaming() && !previewLog()}
        />
        <Show when={currentBranch()}>
          <text
            dimmed={!branchFilterEnabled()}
            fg={branchFilterEnabled() ? 'suggestion' : undefined}
          >
            [{branchFilterEnabled() ? figures.checkboxOn : figures.checkboxOff}] branch:{' '}
            {currentBranch()}
          </text>
        </Show>
      </box>

      {/* Preview mode */}
      <Show when={previewLog()}>
        <SessionPreview log={previewLog()!} onClose={() => setPreviewLog(null)} />
      </Show>

      {/* Rename mode */}
      <Show when={isRenaming()}>
        <box flexDirection="column" gap={1}>
          <text>Rename session:</text>
          <TextInput
            value={renameValue()}
            onChange={setRenameValue}
            onSubmit={handleRenameSave}
            placeholder="Enter new name..."
          />
          <text dimmed>Enter to save, Esc to cancel</text>
        </box>
      </Show>

      {/* Log list */}
      <Show when={!previewLog() && !isRenaming()}>
        <Show
          when={filteredLogs().length > 0}
          fallback={
            <text dimmed>
              {searchQuery() ? 'No matching sessions found.' : 'No sessions to resume.'}
            </text>
          }
        >
          <TreeSelect
            nodes={treeNodes()}
            onSelect={handleSelect}
            maxHeight={Math.min(maxHeight(), 20)}
          />
        </Show>
      </Show>

      {/* Footer */}
      <box marginTop={1}>
        <text dimmed>
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="resume" />
            <Show when={isResumeWithRenameEnabled}>
              <KeyboardShortcutHint shortcut="r" action="rename" />
            </Show>
            <KeyboardShortcutHint shortcut="p" action="preview" />
            <Show when={showAllProjects() !== undefined && props.onToggleAllProjects}>
              <KeyboardShortcutHint
                shortcut="a"
                action={showAllProjects() ? 'this project' : 'all projects'}
              />
            </Show>
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </text>
      </box>
    </box>
  )
}
