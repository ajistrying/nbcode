/**
 * FilePermissionDialog — SolidJS port of
 * src/components/permissions/FilePermissionDialog/FilePermissionDialog.tsx
 *
 * Generic permission dialog for file operations (read/write/edit).
 * Supports IDE diff integration, symlink warnings, and feedback input.
 */
import { relative } from 'path'
import { createMemo, Show, type JSX } from 'solid-js'
import type { ToolUseContext } from '../../../Tool.js'
import { getLanguageName } from '../../../utils/cliHighlight.js'
import { getCwd } from '../../../utils/cwd.js'
import { getFsImplementation, safeResolvePath } from '../../../utils/fsOperations.js'
import { expandPath } from '../../../utils/path.js'
import type { CompletionType } from '../../../utils/unaryLogging.js'
import type { IDEDiffSupport } from '../../../components/permissions/FilePermissionDialog/ideDiffConfig.js'
import type {
  FileOperationType,
  PermissionOption,
} from '../../../components/permissions/FilePermissionDialog/permissionOptions.js'
import type { ToolUseConfirm } from '../../../components/permissions/PermissionRequest.js'
import type { WorkerBadgeProps } from '../../../components/permissions/WorkerBadge.js'

type ToolInput = { file_path: string }

export type FilePermissionDialogProps<T extends ToolInput = ToolInput> = {
  toolUseConfirm: ToolUseConfirm
  toolUseContext: ToolUseContext
  onDone: () => void
  onReject: () => void
  title: string
  subtitle?: JSX.Element
  question?: string | JSX.Element
  content?: JSX.Element
  completionType?: CompletionType
  languageName?: string
  path: string | null
  parseInput: (input: unknown) => T
  operationType?: FileOperationType
  ideDiffSupport?: IDEDiffSupport<T>
  workerBadge: WorkerBadgeProps | undefined
}

export function FilePermissionDialog<T extends ToolInput = ToolInput>(
  props: FilePermissionDialogProps<T>,
): JSX.Element {
  const operationType = () => props.operationType ?? 'write'
  const question = () => props.question ?? 'Do you want to proceed?'

  // Derive language name
  const languageName = createMemo(
    () => props.languageName ?? (props.path ? getLanguageName(props.path) : 'none'),
  )

  // Check for symlinks
  const symlinkTarget = createMemo(() => {
    if (!props.path || operationType() === 'read') return null
    const expandedPath = expandPath(props.path)
    const fs = getFsImplementation()
    const { resolvedPath, isSymlink } = safeResolvePath(fs, expandedPath)
    return isSymlink ? resolvedPath : null
  })

  const isSymlinkOutsideCwd = () => {
    const target = symlinkTarget()
    return target != null && relative(getCwd(), target).startsWith('..')
  }

  // Parse input
  const parsedInput = createMemo(() => props.parseInput(props.toolUseConfirm.input))

  return (
    <>
      <box flexDirection="column">
        {/* Title */}
        <text>
          <b>{props.title}</b>
        </text>
        <Show when={props.subtitle}>{props.subtitle}</Show>

        {/* Symlink warning */}
        <Show when={symlinkTarget()}>
          <box paddingX={1} marginBottom={1}>
            <text fg="yellow">
              {isSymlinkOutsideCwd()
                ? `This will modify ${symlinkTarget()} (outside working directory) via a symlink`
                : `Symlink target: ${symlinkTarget()}`}
            </text>
          </box>
        </Show>

        {/* Content (diff, etc.) */}
        {props.content}

        {/* Question and options */}
        <box flexDirection="column" paddingX={1}>
          <Show when={typeof question() === 'string'}>
            <text>{question() as string}</text>
          </Show>
          <Show when={typeof question() !== 'string'}>{question() as JSX.Element}</Show>
          {/* Select options would be rendered here via SolidJS Select */}
          <text dimmed>Select an option...</text>
        </box>
      </box>

      {/* Footer */}
      <box paddingX={1} marginTop={1}>
        <text dimmed>Esc to cancel</text>
      </box>
    </>
  )
}
