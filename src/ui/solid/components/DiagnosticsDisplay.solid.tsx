import type { JSX } from '@opentui/solid'
import { Show, For } from 'solid-js'
import { relative } from 'path'
import { DiagnosticTrackingService } from '../../../services/diagnosticTracking.js'
import type { Attachment } from '../../../utils/attachments.js'
import { getCwd } from '../../../utils/cwd.js'
import { CtrlOToExpand } from './CtrlOToExpand.solid.js'
import { MessageResponse } from './MessageResponse.solid.js'

type DiagnosticsAttachment = Extract<Attachment, { type: 'diagnostics' }>

type DiagnosticsDisplayProps = {
  attachment: DiagnosticsAttachment
  verbose: boolean
}

export function DiagnosticsDisplay(props: DiagnosticsDisplayProps): JSX.Element {
  if (props.attachment.files.length === 0) return null as unknown as JSX.Element

  const totalIssues = () =>
    props.attachment.files.reduce((sum, file) => sum + file.diagnostics.length, 0)
  const fileCount = () => props.attachment.files.length

  return (
    <Show
      when={props.verbose}
      fallback={
        <MessageResponse>
          <text dimmed wrap="wrap">
            Found <text><b>{totalIssues()}</b></text> new diagnostic{' '}
            {totalIssues() === 1 ? 'issue' : 'issues'} in {fileCount()}{' '}
            {fileCount() === 1 ? 'file' : 'files'} <CtrlOToExpand />
          </text>
        </MessageResponse>
      }
    >
      <box flexDirection="column">
        <For each={props.attachment.files}>{(file, fileIndex) => (
          <>
            <MessageResponse>
              <text dimmed wrap="wrap">
                <text><b>
                  {relative(
                    getCwd(),
                    file.uri
                      .replace('file://', '')
                      .replace('_claude_fs_right:', ''),
                  )}
                </b></text>{' '}
                <text dimmed>
                  {file.uri.startsWith('file://')
                    ? '(file://)'
                    : file.uri.startsWith('_claude_fs_right:')
                      ? '(claude_fs_right)'
                      : `(${file.uri.split(':')[0]})`}
                </text>
                :
              </text>
            </MessageResponse>
            <For each={file.diagnostics}>{(diagnostic, diagIndex) => (
              <MessageResponse>
                <text dimmed wrap="wrap">
                  {'  '}
                  {DiagnosticTrackingService.getSeveritySymbol(diagnostic.severity)}
                  {' [Line '}
                  {diagnostic.range.start.line + 1}:
                  {diagnostic.range.start.character + 1}
                  {'] '}
                  {diagnostic.message}
                  {diagnostic.code ? ` [${diagnostic.code}]` : ''}
                  {diagnostic.source ? ` (${diagnostic.source})` : ''}
                </text>
              </MessageResponse>
            )}</For>
          </>
        )}</For>
      </box>
    </Show>
  ) as JSX.Element
}
