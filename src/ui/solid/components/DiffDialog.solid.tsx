/**
 * DiffDialog — SolidJS port of src/components/diff/DiffDialog.tsx
 *
 * Shows a dialog for viewing file diffs — either current uncommitted changes
 * or per-turn diffs. Supports list view, detail view, source switching.
 */
import type { StructuredPatchHunk } from 'diff'
import { createSignal, createEffect, createMemo, Show, For, type JSX } from 'solid-js'
import type { CommandResultDisplay } from '../../../commands.js'
import type { DiffData } from '../../../hooks/useDiffData.js'
import type { TurnDiff } from '../../../hooks/useTurnDiffs.js'
import type { Message } from '../../../types/message.js'
import { plural } from '../../../utils/stringUtils.js'

type DiffSource = { type: 'current' } | { type: 'turn'; turn: TurnDiff }

type DiffDialogProps = {
  messages: Message[]
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  // Injected data (in React these came from hooks):
  gitDiffData: DiffData
  turnDiffs: TurnDiff[]
}

function turnDiffToDiffData(turn: TurnDiff): DiffData {
  const files = Array.from(turn.files.values())
    .map((f) => ({
      path: f.filePath,
      linesAdded: f.linesAdded,
      linesRemoved: f.linesRemoved,
      isBinary: false,
      isLargeFile: false,
      isTruncated: false,
      isNewFile: f.isNewFile,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const hunks = new Map<string, StructuredPatchHunk[]>()
  for (const f of turn.files.values()) {
    hunks.set(f.filePath, f.hunks)
  }
  return {
    stats: {
      filesCount: turn.stats.filesChanged,
      linesAdded: turn.stats.linesAdded,
      linesRemoved: turn.stats.linesRemoved,
    },
    files,
    hunks,
    loading: false,
  }
}

export function DiffDialog(props: DiffDialogProps): JSX.Element {
  const [viewMode, setViewMode] = createSignal<'list' | 'detail'>('list')
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [sourceIndex, setSourceIndex] = createSignal(0)

  const sources = createMemo<DiffSource[]>(() => [
    { type: 'current' },
    ...props.turnDiffs.map((turn) => ({ type: 'turn' as const, turn })),
  ])

  const currentSource = () => sources()[sourceIndex()]
  const currentTurn = () => (currentSource()?.type === 'turn' ? (currentSource() as any).turn : null)

  const diffData = createMemo(() =>
    currentTurn() ? turnDiffToDiffData(currentTurn()) : props.gitDiffData,
  )

  const selectedFile = () => diffData().files[selectedIndex()]
  const selectedHunks = () =>
    selectedFile() ? diffData().hunks.get(selectedFile()!.path) || [] : []

  // Clamp sourceIndex when sources shrink
  createEffect(() => {
    if (sourceIndex() >= sources().length) {
      setSourceIndex(Math.max(0, sources().length - 1))
    }
  })

  // Reset selectedIndex when source changes
  let prevSourceIdx = sourceIndex()
  createEffect(() => {
    if (prevSourceIdx !== sourceIndex()) {
      setSelectedIndex(0)
      prevSourceIdx = sourceIndex()
    }
  })

  const headerTitle = () =>
    currentTurn() ? `Turn ${currentTurn().turnIndex}` : 'Uncommitted changes'
  const headerSubtitle = () =>
    currentTurn()
      ? currentTurn().userPromptPreview
        ? `"${currentTurn().userPromptPreview}"`
        : ''
      : '(git diff HEAD)'

  const subtitle = createMemo(() => {
    const stats = diffData().stats
    if (!stats) return null
    const parts: string[] = []
    parts.push(`${stats.filesCount} ${plural(stats.filesCount, 'file')} changed`)
    if (stats.linesAdded > 0) parts.push(`+${stats.linesAdded}`)
    if (stats.linesRemoved > 0) parts.push(`-${stats.linesRemoved}`)
    return parts.join(' ')
  })

  const emptyMessage = () => {
    if (diffData().loading) return 'Loading diff\u2026'
    if (currentTurn()) return 'No file changes in this turn'
    if (diffData().stats && diffData().stats!.filesCount > 0 && diffData().files.length === 0)
      return 'Too many files to display details'
    return 'Working tree is clean'
  }

  return (
    <box flexDirection="column">
      {/* Title */}
      <text>
        {headerTitle()}
        <Show when={headerSubtitle()}>
          <text dimmed> {headerSubtitle()}</text>
        </Show>
      </text>

      {/* Source selector */}
      <Show when={sources().length > 1}>
        <box>
          <Show when={sourceIndex() > 0}>
            <text dimmed>{'\u25C0 '}</text>
          </Show>
          <For each={sources()}>
            {(source, i) => {
              const isSelected = () => i() === sourceIndex()
              const label = () =>
                source.type === 'current' ? 'Current' : `T${(source as any).turn.turnIndex}`
              return (
                <text dimmed={!isSelected()}>
                  <Show when={isSelected()}>
                    <b>
                      {i() > 0 ? ' \u00B7 ' : ''}
                      {label()}
                    </b>
                  </Show>
                  <Show when={!isSelected()}>
                    {i() > 0 ? ' \u00B7 ' : ''}
                    {label()}
                  </Show>
                </text>
              )
            }}
          </For>
          <Show when={sourceIndex() < sources().length - 1}>
            <text dimmed>{' \u25B6'}</text>
          </Show>
        </box>
      </Show>

      {/* Subtitle stats */}
      <Show when={subtitle()}>
        <text dimmed>{subtitle()}</text>
      </Show>

      {/* Content */}
      <Show when={diffData().files.length === 0}>
        <box marginTop={1}>
          <text dimmed>{emptyMessage()}</text>
        </box>
      </Show>
      <Show when={diffData().files.length > 0 && viewMode() === 'list'}>
        <box flexDirection="column" marginTop={1}>
          <For each={diffData().files}>
            {(file, i) => (
              <text
                fg={i() === selectedIndex() ? 'cyan' : undefined}
                dimmed={i() !== selectedIndex()}
              >
                {file.path}
                {file.linesAdded > 0 && <text fg="green"> +{file.linesAdded}</text>}
                {file.linesRemoved > 0 && <text fg="red"> -{file.linesRemoved}</text>}
              </text>
            )}
          </For>
        </box>
      </Show>
      <Show when={viewMode() === 'detail' && selectedFile()}>
        <box flexDirection="column" marginTop={1}>
          <text>
            <b>{selectedFile()!.path}</b>
          </text>
          <For each={selectedHunks()}>
            {(hunk) => (
              <box flexDirection="column">
                <text dimmed>
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </text>
                <For each={hunk.lines}>
                  {(line) => (
                    <text
                      fg={
                        line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : undefined
                      }
                    >
                      {line}
                    </text>
                  )}
                </For>
              </box>
            )}
          </For>
        </box>
      </Show>

      {/* Footer */}
      <text dimmed>
        <Show when={viewMode() === 'list'}>
          {sources().length > 1 && '\u2190/\u2192 source \u00B7 '}
          {'\u2191/\u2193 select \u00B7 Enter view \u00B7 esc close'}
        </Show>
        <Show when={viewMode() === 'detail'}>{'\u2190 back \u00B7 esc close'}</Show>
      </text>
    </box>
  )
}
