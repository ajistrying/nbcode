import * as path from 'path'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { generateFileSuggestions } from '../../../hooks/fileSuggestions.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { logEvent } from '../../../services/analytics/index.js'
import { getCwd } from '../../../utils/cwd.js'
import { openFileInExternalEditor } from '../../../utils/editor.js'
import {
  truncatePathMiddle,
  truncateToWidth,
} from '../../../utils/format.js'
import { highlightMatch } from '../../../utils/highlightMatch.js'
import { readFileInRange } from '../../../utils/readFileInRange.js'

type Props = {
  onDone: () => void
  onInsert: (text: string) => void
}

const VISIBLE_RESULTS = 8
const PREVIEW_LINES = 20

/**
 * Quick Open dialog (ctrl+shift+p / cmd+shift+p).
 * Fuzzy file finder with a syntax-highlighted preview of the focused file.
 */
export function QuickOpenDialog(props: Props) {
  const { columns, rows } = useTerminalSize()
  const visibleResults = Math.min(
    VISIBLE_RESULTS,
    Math.max(4, rows - 14),
  )

  const [results, setResults] = createSignal<string[]>([])
  const [query, setQuery] = createSignal('')
  const [focusedPath, setFocusedPath] = createSignal<
    string | undefined
  >(undefined)
  const [preview, setPreview] = createSignal<{
    path: string
    content: string
  } | null>(null)
  let queryGen = 0

  // Cleanup on unmount
  onCleanup(() => {
    queryGen++
  })

  const previewOnRight = columns >= 120
  const effectivePreviewLines = previewOnRight
    ? VISIBLE_RESULTS - 1
    : PREVIEW_LINES

  const handleQueryChange = (q: string) => {
    setQuery(q)
    const gen = ++queryGen
    if (!q.trim()) {
      setResults([])
      return
    }
    generateFileSuggestions(q, true).then((items) => {
      if (gen !== queryGen) {
        return
      }
      const paths = items
        .filter((i) => i.id.startsWith('file-'))
        .map((i) => i.displayText)
        .filter((p) => !p.endsWith(path.sep))
        .map((p) => p.split(path.sep).join('/'))
      setResults(paths)
    })
  }

  // Preview loading effect
  createEffect(() => {
    const fp = focusedPath()
    if (!fp) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const absolute = path.resolve(getCwd(), fp)
    readFileInRange(
      absolute,
      0,
      effectivePreviewLines,
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (controller.signal.aborted) return
        setPreview({ path: fp, content: r.content })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPreview({ path: fp, content: '(preview unavailable)' })
      })
    onCleanup(() => controller.abort())
  })

  const maxPathWidth = previewOnRight
    ? Math.max(20, Math.floor((columns - 10) * 0.4))
    : Math.max(20, columns - 8)
  const previewWidth = previewOnRight
    ? Math.max(40, columns - maxPathWidth - 14)
    : columns - 6

  const handleOpen = (p: string) => {
    const opened = openFileInExternalEditor(
      path.resolve(getCwd(), p),
    )
    logEvent('tengu_quick_open_select', {
      result_count: results().length,
      opened_editor: opened,
    })
    props.onDone()
  }

  const handleInsert = (p: string, mention: boolean) => {
    props.onInsert(mention ? `@${p} ` : `${p} `)
    logEvent('tengu_quick_open_insert', {
      result_count: results().length,
      mention,
    })
    props.onDone()
  }

  // Render: FuzzyPicker would be the child component
  // Since FuzzyPicker is a complex component that should be ported separately,
  // we represent the structure here.
  return (
    <box flexDirection="column">
      <text>
        <b>Quick Open</b>
      </text>
      <text dimmed>
        Type to search files... ({results().length} results)
      </text>
      {/* FuzzyPicker component would be rendered here */}
    </box>
  )
}
