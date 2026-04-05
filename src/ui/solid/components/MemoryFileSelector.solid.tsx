/**
 * MemoryFileSelector — SolidJS port of src/components/memory/MemoryFileSelector.tsx
 *
 * Presents a list of memory files (user, project, auto-memory, agent memory, etc.)
 * with toggles for auto-memory and auto-dream features.
 */
import chalk from 'chalk'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { createSignal, createEffect, Show, type JSX } from 'solid-js'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import { getAutoMemPath, isAutoMemoryEnabled } from '../../../memdir/paths.js'
import { logEvent } from '../../../services/analytics/index.js'
import { isAutoDreamEnabled } from '../../../services/autoDream/config.js'
import { readLastConsolidatedAt } from '../../../services/autoDream/consolidationLock.js'
import { getAgentMemoryDir } from '../../../tools/AgentTool/agentMemory.js'
import { openPath } from '../../../utils/browser.js'
import { getMemoryFiles, type MemoryFileInfo } from '../../../utils/claudemd.js'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import { getDisplayPath } from '../../../utils/file.js'
import { formatRelativeTimeAgo } from '../../../utils/format.js'
import { projectIsInGitRepo } from '../../../utils/memory/versions.js'
import { updateSettingsForSource } from '../../../utils/settings/settings.js'

const OPEN_FOLDER_PREFIX = '__open_folder__'
let lastSelectedPath: string | undefined

type MemoryFileSelectorProps = {
  onSelect: (path: string) => void
  onCancel: () => void
  // Injected data (in React these came from hooks/context):
  existingMemoryFiles: MemoryFileInfo[]
  agentDefinitions: { activeAgents: Array<{ agentType: string; memory?: string }> }
  isDreamRunning: boolean
}

interface ExtendedMemoryFileInfo extends MemoryFileInfo {
  isNested?: boolean
  exists: boolean
}

export function MemoryFileSelector(props: MemoryFileSelectorProps): JSX.Element {
  const userMemoryPath = join(getClaudeConfigHomeDir(), 'CLAUDE.md')
  const projectMemoryPath = join(getOriginalCwd(), 'CLAUDE.md')

  const hasUserMemory = () => props.existingMemoryFiles.some((f) => f.path === userMemoryPath)
  const hasProjectMemory = () => props.existingMemoryFiles.some((f) => f.path === projectMemoryPath)

  const allMemoryFiles = (): ExtendedMemoryFileInfo[] => {
    const filtered = props.existingMemoryFiles
      .filter((f) => f.type !== 'AutoMem' && f.type !== 'TeamMem')
      .map((f) => ({ ...f, exists: true }))
    return [
      ...filtered,
      ...(hasUserMemory()
        ? []
        : [{ path: userMemoryPath, type: 'User' as const, content: '', exists: false }]),
      ...(hasProjectMemory()
        ? []
        : [{ path: projectMemoryPath, type: 'Project' as const, content: '', exists: false }]),
    ] as ExtendedMemoryFileInfo[]
  }

  const memoryOptions = () => {
    const files = allMemoryFiles()
    const depths = new Map<string, number>()
    const opts = files.map((file) => {
      const displayPath = getDisplayPath(file.path)
      const existsLabel = file.exists ? '' : ' (new)'
      const depth = (file as any).parent ? (depths.get((file as any).parent) ?? 0) + 1 : 0
      depths.set(file.path, depth)
      const indent = depth > 0 ? '  '.repeat(depth - 1) : ''

      let label: string
      if (file.type === 'User' && !file.isNested && file.path === userMemoryPath) {
        label = 'User memory'
      } else if (file.type === 'Project' && !file.isNested && file.path === projectMemoryPath) {
        label = 'Project memory'
      } else if (depth > 0) {
        label = `${indent}L ${displayPath}${existsLabel}`
      } else {
        label = displayPath
      }

      let description: string
      const isGit = projectIsInGitRepo(getOriginalCwd())
      if (file.type === 'User' && !file.isNested) {
        description = 'Saved in ~/.claude/CLAUDE.md'
      } else if (file.type === 'Project' && !file.isNested && file.path === projectMemoryPath) {
        description = `${isGit ? 'Checked in at' : 'Saved in'} ./CLAUDE.md`
      } else if ((file as any).parent) {
        description = '@-imported'
      } else if (file.isNested) {
        description = 'dynamically loaded'
      } else {
        description = ''
      }

      return { label, value: file.path, description }
    })

    // Add folder options for auto-memory
    if (isAutoMemoryEnabled()) {
      opts.push({
        label: 'Open auto-memory folder',
        value: `${OPEN_FOLDER_PREFIX}${getAutoMemPath()}`,
        description: '',
      })

      for (const agent of props.agentDefinitions.activeAgents) {
        if (agent.memory) {
          const agentDir = getAgentMemoryDir(agent.agentType, agent.memory)
          opts.push({
            label: `Open ${chalk.bold(agent.agentType)} agent memory`,
            value: `${OPEN_FOLDER_PREFIX}${agentDir}`,
            description: `${agent.memory} scope`,
          })
        }
      }
    }

    return opts
  }

  const initialPath = () => {
    const opts = memoryOptions()
    return lastSelectedPath && opts.some((opt) => opt.value === lastSelectedPath)
      ? lastSelectedPath
      : opts[0]?.value || ''
  }

  const [autoMemoryOn, setAutoMemoryOn] = createSignal(isAutoMemoryEnabled())
  const [autoDreamOn, setAutoDreamOn] = createSignal(isAutoDreamEnabled())
  const [showDreamRow] = createSignal(isAutoMemoryEnabled())
  const [lastDreamAt, setLastDreamAt] = createSignal<number | null>(null)
  const [focusedToggle, setFocusedToggle] = createSignal<number | null>(null)

  // Load dream status
  createEffect(() => {
    if (!showDreamRow()) return
    readLastConsolidatedAt().then(setLastDreamAt)
  })

  const dreamStatus = () => {
    if (props.isDreamRunning) return 'running'
    if (lastDreamAt() === null) return ''
    if (lastDreamAt() === 0) return 'never'
    return `last ran ${formatRelativeTimeAgo(new Date(lastDreamAt()!))}`
  }

  const toggleFocused = () => focusedToggle() !== null
  const lastToggleIndex = () => (showDreamRow() ? 1 : 0)

  function handleToggleAutoMemory() {
    const newValue = !autoMemoryOn()
    updateSettingsForSource('userSettings', { autoMemoryEnabled: newValue })
    setAutoMemoryOn(newValue)
    logEvent('tengu_auto_memory_toggled', { enabled: newValue })
  }

  function handleToggleAutoDream() {
    const newValue = !autoDreamOn()
    updateSettingsForSource('userSettings', { autoDreamEnabled: newValue })
    setAutoDreamOn(newValue)
    logEvent('tengu_auto_dream_toggled', { enabled: newValue })
  }

  function handleSelect(value: string) {
    if (value.startsWith(OPEN_FOLDER_PREFIX)) {
      const folderPath = value.slice(OPEN_FOLDER_PREFIX.length)
      mkdir(folderPath, { recursive: true })
        .catch(() => {})
        .then(() => openPath(folderPath))
      return
    }
    lastSelectedPath = value
    props.onSelect(value)
  }

  return (
    <box flexDirection="column" width="100%">
      {/* Toggle rows */}
      <box flexDirection="column" marginBottom={1}>
        <text fg={focusedToggle() === 0 ? 'cyan' : undefined}>
          Auto-memory: {autoMemoryOn() ? 'on' : 'off'}
        </text>
        <Show when={showDreamRow()}>
          <text fg={focusedToggle() === 1 ? 'cyan' : undefined}>
            Auto-dream: {autoDreamOn() ? 'on' : 'off'}
            <Show when={dreamStatus()}>
              <text dimmed> · {dreamStatus()}</text>
            </Show>
            <Show when={!props.isDreamRunning && autoDreamOn()}>
              <text dimmed> · /dream to run</text>
            </Show>
          </text>
        </Show>
      </box>

      {/* Memory file list */}
      <box flexDirection="column">
        {/* Placeholder for Select component — would use the SolidJS Select port */}
        <text dimmed>Select a memory file to edit:</text>
        {memoryOptions().map((opt) => (
          <text>
            {opt.label}
            {opt.description && <text dimmed> — {opt.description}</text>}
          </text>
        ))}
      </box>
    </box>
  )
}
