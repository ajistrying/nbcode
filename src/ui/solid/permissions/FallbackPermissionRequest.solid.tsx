import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import { env } from '../../../utils/env.js'
import { shouldShowAlwaysAllowOptions } from '../../../utils/permissions/permissionsLoader.js'
import { truncateToLines } from '../../../utils/stringUtils.js'
import { logUnaryEvent } from '../../../utils/unaryLogging.js'
import { type UnaryEvent, usePermissionRequestLogging } from '../../../components/permissions/hooks.js'
import { PermissionDialog } from './PermissionDialog.solid.js'
import {
  PermissionPrompt,
  type PermissionPromptOption,
  type ToolAnalyticsContext,
} from '../../../components/permissions/PermissionPrompt.js'
import type { PermissionRequestProps } from './PermissionRequest.solid.js'
import { PermissionRuleExplanation } from './PermissionRuleExplanation.solid.js'

type FallbackOptionValue = 'yes' | 'yes-dont-ask-again' | 'no'

/**
 * No stateful hooks in original (useCallback/useMemo only, which become plain fns).
 * useTheme is used once.
 */
export function FallbackPermissionRequest(props: PermissionRequestProps & { workerBadge?: JSX.Element }): JSX.Element {
  const originalUserFacingName = () =>
    props.toolUseConfirm.tool.userFacingName(props.toolUseConfirm.input as never)

  const userFacingName = () => {
    const name = originalUserFacingName()
    return name.endsWith(' (MCP)') ? name.slice(0, -6) : name
  }

  const unaryEvent: UnaryEvent = {
    completion_type: 'tool_use_single',
    language_name: 'none',
  }

  usePermissionRequestLogging(props.toolUseConfirm, unaryEvent)

  function handleSelect(value: FallbackOptionValue, feedback?: string) {
    switch (value) {
      case 'yes': {
        logUnaryEvent({
          completion_type: 'tool_use_single',
          event: 'accept',
          metadata: {
            language_name: 'none',
            message_id: props.toolUseConfirm.assistantMessage.message.id,
            platform: env.platform,
          },
        })
        props.toolUseConfirm.onAllow(props.toolUseConfirm.input, [], feedback)
        props.onDone()
        break
      }
      case 'yes-dont-ask-again': {
        logUnaryEvent({
          completion_type: 'tool_use_single',
          event: 'accept',
          metadata: {
            language_name: 'none',
            message_id: props.toolUseConfirm.assistantMessage.message.id,
            platform: env.platform,
          },
        })
        props.toolUseConfirm.onAllow(props.toolUseConfirm.input, [
          {
            type: 'addRules',
            rules: [{ toolName: props.toolUseConfirm.tool.name }],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ])
        props.onDone()
        break
      }
      case 'no': {
        logUnaryEvent({
          completion_type: 'tool_use_single',
          event: 'reject',
          metadata: {
            language_name: 'none',
            message_id: props.toolUseConfirm.assistantMessage.message.id,
            platform: env.platform,
          },
        })
        props.toolUseConfirm.onReject(feedback)
        props.onReject()
        props.onDone()
        break
      }
    }
  }

  function handleCancel() {
    logUnaryEvent({
      completion_type: 'tool_use_single',
      event: 'reject',
      metadata: {
        language_name: 'none',
        message_id: props.toolUseConfirm.assistantMessage.message.id,
        platform: env.platform,
      },
    })
    props.toolUseConfirm.onReject()
    props.onReject()
    props.onDone()
  }

  const originalCwd = getOriginalCwd()
  const showAlwaysAllowOptions = shouldShowAlwaysAllowOptions()

  const options = (): PermissionPromptOption<FallbackOptionValue>[] => {
    const result: PermissionPromptOption<FallbackOptionValue>[] = [
      { label: 'Yes', value: 'yes', feedbackConfig: { type: 'accept' } },
    ]
    if (showAlwaysAllowOptions) {
      result.push({
        label: (
          <text>
            Yes, and don't ask again for <text><b>{userFacingName()}</b></text> commands in{' '}
            <text><b>{originalCwd}</b></text>
          </text>
        ),
        value: 'yes-dont-ask-again',
      })
    }
    result.push({
      label: 'No',
      value: 'no',
      feedbackConfig: { type: 'reject' },
    })
    return result
  }

  const toolAnalyticsContext = (): ToolAnalyticsContext => ({
    toolName: sanitizeToolNameForAnalytics(props.toolUseConfirm.tool.name),
    isMcp: props.toolUseConfirm.tool.isMcp ?? false,
  })

  const toolUseMessage = () =>
    props.toolUseConfirm.tool.renderToolUseMessage(props.toolUseConfirm.input as never, {
      verbose: true,
    })

  const mcpSuffix = () =>
    originalUserFacingName().endsWith(' (MCP)') ? <text dimmed> (MCP)</text> : ''

  return (
    <PermissionDialog title="Tool use" workerBadge={props.workerBadge}>
      <box flexDirection="column" paddingX={2} paddingY={1}>
        <text>
          {userFacingName()}({toolUseMessage()}){mcpSuffix()}
        </text>
        <text dimmed>{truncateToLines(props.toolUseConfirm.description, 3)}</text>
      </box>
      <box flexDirection="column">
        <PermissionRuleExplanation
          permissionResult={props.toolUseConfirm.permissionResult}
          toolType="tool"
        />
        <PermissionPrompt
          options={options()}
          onSelect={handleSelect}
          onCancel={handleCancel}
          toolAnalyticsContext={toolAnalyticsContext()}
        />
      </box>
    </PermissionDialog>
  )
}
