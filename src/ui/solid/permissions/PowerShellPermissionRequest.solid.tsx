/**
 * PowerShellPermissionRequest — SolidJS port of
 * src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx
 *
 * Permission dialog for PowerShell commands with editable prefix,
 * destructive command warnings, and explainer UI.
 */
import { createSignal, createEffect, createMemo, onCleanup, Show, type JSX } from 'solid-js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import { getDestructiveCommandWarning } from '../../../tools/PowerShellTool/destructiveCommandWarning.js'
import { PowerShellTool } from '../../../tools/PowerShellTool/PowerShellTool.js'
import { isAllowlistedCommand } from '../../../tools/PowerShellTool/readOnlyValidation.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { getCompoundCommandPrefixesStatic } from '../../../utils/powershell/staticPrefix.js'
import type { PermissionRequestProps } from '../../../components/permissions/PermissionRequest.js'

export function PowerShellPermissionRequest(props: PermissionRequestProps): JSX.Element {
  const { toolUseConfirm, toolUseContext, onDone, onReject, workerBadge } = props
  const { command, description } = PowerShellTool.inputSchema.parse(toolUseConfirm.input)

  const [showPermissionDebug, setShowPermissionDebug] = createSignal(false)
  const [editablePrefix, setEditablePrefix] = createSignal<string | undefined>(
    command.includes('\n') ? undefined : command,
  )
  let hasUserEditedPrefix = false

  // Compute static prefix asynchronously
  createEffect(() => {
    let cancelled = false
    getCompoundCommandPrefixesStatic(command, (element: any) =>
      isAllowlistedCommand(element, element.text),
    )
      .then((prefixes: string[]) => {
        if (cancelled || hasUserEditedPrefix) return
        if (prefixes.length > 0) {
          setEditablePrefix(`${prefixes[0]}:*`)
        }
      })
      .catch(() => {})
    onCleanup(() => {
      cancelled = true
    })
  })

  function onEditablePrefixChange(value: string) {
    hasUserEditedPrefix = true
    setEditablePrefix(value)
  }

  const destructiveWarning = () =>
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_destructive_command_warning', false)
      ? getDestructiveCommandWarning(command)
      : null

  function onSelect(value: string) {
    const optionIndex: Record<string, number> = {
      yes: 1,
      'yes-apply-suggestions': 2,
      'yes-prefix-edited': 2,
      no: 3,
    }
    logEvent('tengu_permission_request_option_selected', {
      option_index: optionIndex[value],
    })

    const toolNameForAnalytics = sanitizeToolNameForAnalytics(
      toolUseConfirm.tool.name,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    if (value === 'yes-prefix-edited') {
      const trimmedPrefix = (editablePrefix() ?? '').trim()
      if (!trimmedPrefix) {
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
      } else {
        const prefixUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [{ toolName: PowerShellTool.name, ruleContent: trimmedPrefix }],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ]
        toolUseConfirm.onAllow(toolUseConfirm.input, prefixUpdates)
      }
      onDone()
      return
    }

    switch (value) {
      case 'yes':
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
        onDone()
        break
      case 'yes-apply-suggestions': {
        const permissionUpdates =
          'suggestions' in toolUseConfirm.permissionResult
            ? toolUseConfirm.permissionResult.suggestions || []
            : []
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates)
        onDone()
        break
      }
      case 'no':
        onReject()
        break
    }
  }

  return (
    <box flexDirection="column">
      {/* Title */}
      <text>
        <b>PowerShell command</b>
      </text>

      {/* Command display */}
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <text>{command}</text>
        <Show when={description}>
          <text dimmed>{description}</text>
        </Show>
      </box>

      <Show when={!showPermissionDebug()}>
        {/* Destructive warning */}
        <Show when={destructiveWarning()}>
          <box marginBottom={1}>
            <text fg="yellow">{destructiveWarning()}</text>
          </box>
        </Show>

        {/* Question */}
        <text>Do you want to proceed?</text>

        {/* Options placeholder */}
        <text dimmed>Select an option...</text>

        {/* Footer */}
        <box justifyContent="space-between" marginTop={1}>
          <text dimmed>Esc to cancel</text>
          <Show when={toolUseContext.options.debug}>
            <text dimmed>Ctrl+d to show debug info</text>
          </Show>
        </box>
      </Show>

      <Show when={showPermissionDebug()}>
        <text dimmed>Permission debug info...</text>
        <Show when={toolUseContext.options.debug}>
          <box justifyContent="flex-end" marginTop={1}>
            <text dimmed>Ctrl-D to hide debug info</text>
          </box>
        </Show>
      </Show>
    </box>
  )
}
