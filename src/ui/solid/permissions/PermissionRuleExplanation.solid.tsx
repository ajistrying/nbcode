import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import chalk from 'chalk'
import { Ansi } from '../../../ink.js'
import { useAppState } from '../../../state/AppState.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from '../../../utils/permissions/PermissionResult.js'
import { permissionRuleValueToString } from '../../../utils/permissions/permissionRuleParser.js'
import type { Theme } from '../../../utils/theme.js'
import ThemedText from '../../design-system/ThemedText.js'

export type PermissionRuleExplanationProps = {
  permissionResult: PermissionDecision
  toolType: 'tool' | 'command' | 'edit' | 'read'
}

type DecisionReasonStrings = {
  reasonString: string
  configString?: string
  /** When set, reasonString is plain text rendered with this theme color instead of <Ansi>. */
  themeColor?: keyof Theme
}

function stringsForDecisionReason(
  reason: PermissionDecisionReason | undefined,
  toolType: 'tool' | 'command' | 'edit' | 'read',
): DecisionReasonStrings | null {
  if (!reason) {
    return null
  }
  if (
    (feature('BASH_CLASSIFIER') || feature('TRANSCRIPT_CLASSIFIER')) &&
    reason.type === 'classifier'
  ) {
    if (reason.classifier === 'auto-mode') {
      return {
        reasonString: `Auto mode classifier requires confirmation for this ${toolType}.\n${reason.reason}`,
        configString: undefined,
        themeColor: 'error',
      }
    }
    return {
      reasonString: `Classifier ${chalk.bold(reason.classifier)} requires confirmation for this ${toolType}.\n${reason.reason}`,
      configString: undefined,
    }
  }
  switch (reason.type) {
    case 'rule':
      return {
        reasonString: `Permission rule ${chalk.bold(
          permissionRuleValueToString(reason.rule.ruleValue),
        )} requires confirmation for this ${toolType}.`,
        configString:
          reason.rule.source === 'policySettings'
            ? undefined
            : '/permissions to update rules',
      }
    case 'hook': {
      const hookReasonString = reason.reason ? `:\n${reason.reason}` : '.'
      const sourceLabel = reason.hookSource
        ? ` ${chalk.dim(`[${reason.hookSource}]`)}`
        : ''
      return {
        reasonString: `Hook ${chalk.bold(reason.hookName)} requires confirmation for this ${toolType}${hookReasonString}${sourceLabel}`,
        configString: '/hooks to update',
      }
    }
    case 'safetyCheck':
    case 'other':
      return {
        reasonString: reason.reason,
        configString: undefined,
      }
    case 'workingDir':
      return {
        reasonString: reason.reason,
        configString: '/permissions to update rules',
      }
    default:
      return null
  }
}

export function PermissionRuleExplanation(props: PermissionRuleExplanationProps): JSX.Element {
  const permissionMode = useAppState((s: any) => s.toolPermissionContext.mode)
  const strings = () =>
    stringsForDecisionReason(
      props.permissionResult?.decisionReason,
      props.toolType,
    )

  const themeColor = () => {
    const s = strings()
    if (!s) return undefined
    return (
      s.themeColor ??
      (props.permissionResult?.decisionReason?.type === 'hook' &&
      permissionMode === 'auto'
        ? 'warning'
        : undefined)
    )
  }

  return (
    <Show when={strings()}>
      <box marginBottom={1} flexDirection="column">
        <Show
          when={themeColor()}
          fallback={
            <text>
              <Ansi>{strings()!.reasonString}</Ansi>
            </text>
          }
        >
          <ThemedText color={themeColor()!}>{strings()!.reasonString}</ThemedText>
        </Show>
        <Show when={strings()!.configString}>
          <text dimmed>{strings()!.configString}</text>
        </Show>
      </box>
    </Show>
  )
}
