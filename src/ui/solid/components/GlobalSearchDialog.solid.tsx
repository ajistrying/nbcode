import { resolve as resolvePath } from 'path'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { logEvent } from '../../../services/analytics/index.js'
import { getCwd } from '../../../utils/cwd.js'
import { openFileInExternalEditor } from '../../../utils/editor.js'
import {
  truncatePathMiddle,
  truncateToWidth,
} from '../../../utils/format.js'
import { highlightMatch } from '../../../utils/highlightMatch.js'
import { relativePath } from '../../../utils/permissions/filesystem.js'
import { readFileInRange } from '../../../utils/readFileInRange.js'
import { ripGrepStream } from '../../../utils/ripgrep.js'

type Props = {
  onDone: () => void
  onInsert: (text: string) => void
}

type Match = {
  file: string
  line: number
  text: string
}

const VISIBLE_RESULTS = 12
const DEBOUNCE_MS = 100
const PREVIEW_CONTEXT_LINES = 4
const MAX_MATCHES_PER_FILE = 10
const MAX_TOTAL_MATCHES = 500

function matchKey(m: Match): string {
  return `${m.file}:${m.line}`
}

/**
 * Parse a ripgrep -n --no-heading output line: "path:line:text".
 */
export function parseRipgrepLine(line: string): Match | null {
  const m = /^(.*?):(\d+):(.*)$/.exec(line)
  if (!m) return null
  const [, file, lineStr, text] = m
  const lineNum = Number(lineStr)
  if (!file || !Number.isFinite(lineNum)) return null
  return { file, line: lineNum, text: text ?? '' }
}

/**
 * Global Search dialog (ctrl+shift+f / cmd+shift+f).
 * Debounced ripgrep search across the workspace.
 */
export function GlobalSearchDialog(props: Props) {
  const { columns, rows } = useTerminalSize()
  const previewOnRight = columns >= 140
  const visibleResults = Math.min(
    VISIBLE_RESULTS,
    Math.max(4, rows - 14),
  )

  const [matches, setMatches] = createSignal<Match[]>([])
  const [truncated, setTruncated] = createSignal(false)
  const [isSearching, setIsSearching] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [focused, setFocused] = createSignal<Match | undefined>(
    undefined,
  )
  const [preview, setPreview] = createSignal<{
    file: string
    line: number
    content: string
  } | null>(null)
  let abortRef: AbortController | null = null
  let timeoutRef: ReturnType<typeof setTimeout> | null = null

  // Cleanup on unmount
  onCleanup(() => {
    if (timeoutRef) {
      clearTimeout(timeoutRef)
    }
    abortRef?.abort()
  })

  // Preview loading effect
  createEffect(() => {
    const f = focused()
    if (!f) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const absolute = resolvePath(getCwd(), f.file)
    const start = Math.max(0, f.line - PREVIEW_CONTEXT_LINES - 1)
    readFileInRange(
      absolute,
      start,
      PREVIEW_CONTEXT_LINES * 2 + 1,
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (controller.signal.aborted) return
        setPreview({ file: f.file, line: f.line, content: r.content })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPreview({
          file: f.file,
          line: f.line,
          content: '(preview unavailable)',
        })
      })
    onCleanup(() => controller.abort())
  })

  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (timeoutRef) {
      clearTimeout(timeoutRef)
    }
    abortRef?.abort()
    if (!q.trim()) {
      setMatches((m) => (m.length ? [] : m))
      setIsSearching(false)
      setTruncated(false)
      return
    }
    const controller = new AbortController()
    abortRef = controller
    setIsSearching(true)
    setTruncated(false)
    const queryLower = q.toLowerCase()
    setMatches((m) => {
      const filtered = m.filter((match) =>
        match.text.toLowerCase().includes(queryLower),
      )
      return filtered.length === m.length ? m : filtered
    })
    timeoutRef = setTimeout(
      (
        query_0: string,
        ctrl: AbortController,
      ) => {
        const cwd = getCwd()
        let collected = 0
        ripGrepStream(
          [
            '-n',
            '--no-heading',
            '-i',
            '-m',
            String(MAX_MATCHES_PER_FILE),
            '-F',
            '-e',
            query_0,
          ],
          cwd,
          ctrl.signal,
          (lines: string[]) => {
            if (ctrl.signal.aborted) return
            const parsed: Match[] = []
            for (const line of lines) {
              const m = parseRipgrepLine(line)
              if (!m) continue
              const rel = relativePath(cwd, m.file)
              parsed.push({
                ...m,
                file: rel.startsWith('..') ? m.file : rel,
              })
            }
            if (!parsed.length) return
            collected += parsed.length
            setMatches((prev) => {
              const seen = new Set(prev.map(matchKey))
              const fresh = parsed.filter(
                (p) => !seen.has(matchKey(p)),
              )
              if (!fresh.length) return prev
              const next = prev.concat(fresh)
              return next.length > MAX_TOTAL_MATCHES
                ? next.slice(0, MAX_TOTAL_MATCHES)
                : next
            })
            if (collected >= MAX_TOTAL_MATCHES) {
              ctrl.abort()
              setTruncated(true)
              setIsSearching(false)
            }
          },
        )
          .catch(() => {})
          .finally(() => {
            if (ctrl.signal.aborted) return
            if (collected === 0) {
              setMatches((m) => (m.length ? [] : m))
            }
            setIsSearching(false)
          })
      },
      DEBOUNCE_MS,
      q,
      controller,
    )
  }

  const listWidth = previewOnRight
    ? Math.floor((columns - 10) * 0.5)
    : columns - 8
  const maxPathWidth = Math.max(20, Math.floor(listWidth * 0.4))
  const maxTextWidth = Math.max(20, listWidth - maxPathWidth - 4)
  const previewWidth = previewOnRight
    ? Math.max(40, columns - listWidth - 14)
    : columns - 6

  const handleOpen = (m: Match) => {
    const opened = openFileInExternalEditor(
      resolvePath(getCwd(), m.file),
      m.line,
    )
    logEvent('tengu_global_search_select', {
      result_count: matches().length,
      opened_editor: opened,
    })
    props.onDone()
  }

  const handleInsert = (m: Match, mention: boolean) => {
    props.onInsert(
      mention
        ? `@${m.file}#L${m.line} `
        : `${m.file}:${m.line} `,
    )
    logEvent('tengu_global_search_insert', {
      result_count: matches().length,
      mention,
    })
    props.onDone()
  }

  const matchLabel = () =>
    matches().length > 0
      ? `${matches().length}${truncated() ? '+' : ''} matches${isSearching() ? '\u2026' : ''}`
      : ' '

  // Render: FuzzyPicker would be the child component
  return (
    <box flexDirection="column">
      <text>
        <b>Global Search</b>
      </text>
      <text dimmed>
        Type to search... ({matchLabel()})
      </text>
      {/* FuzzyPicker component would be rendered here */}
    </box>
  )
}
