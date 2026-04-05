import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { feature } from 'bun:bundle'
import chalk from 'chalk'
import figures from 'figures'
import { useAppState } from '../../../state/AppState.js'
import type { PermissionMode } from '../../../utils/permissions/PermissionMode.js'
import { permissionModeTitle } from '../../../utils/permissions/PermissionMode.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from '../../../utils/permissions/PermissionResult.js'
import { extractRules } from '../../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { permissionRuleValueToString } from '../../../utils/permissions/permissionRuleParser.js'
import { detectUnreachableRules } from '../../../utils/permissions/shadowedRuleDetection.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { getSettingSourceDisplayNameLowercase } from '../../../utils/settings/constants.js'

type PermissionDecisionInfoItemProps = {
  title?: string
  decisionReason: PermissionDecisionReason
}

function decisionReasonDisplayString(
  decisionReason: PermissionDecisionReason & {
    type: Exclude<PermissionDecisionReason['type'], 'subcommandResults'>
  },
): string {
  if (
    (feature('BASH_CLASSIFIER') || feature('TRANSCRIPT_CLASSIFIER')) &&
    decisionReason.type === 'classifier'
  ) {
    return `${chalk.bold(decisionReason.classifier)} classifier: ${decisionReason.reason}`
  }
  switch (decisionReason.type) {
    case 'rule':
      return `${chalk.bold(permissionRuleValueToString(decisionReason.rule.ruleValue))} rule from ${getSettingSourceDisplayNameLowercase(decisionReason.rule.source)}`
    case 'mode':
      return `${permissionModeTitle(decisionReason.mode)} mode`
    case 'sandboxOverride':
      return 'Requires permission to bypass sandbox'
    case 'workingDir':
      return decisionReason.reason
    case 'safetyCheck':
    case 'other':
      return decisionReason.reason
    case 'permissionPromptTool':
      return `${chalk.bold(decisionReason.permissionPromptToolName)} permission prompt tool`
    case 'hook':
      return decisionReason.reason
        ? `${chalk.bold(decisionReason.hookName)} hook: ${decisionReason.reason}`
        : `${chalk.bold(decisionReason.hookName)} hook`
    case 'asyncAgent':
      return decisionReason.reason
    default:
      return ''
  }
}

/**
 * No stateful hooks (useMemo only -> plain computed).
 */
function PermissionDecisionInfoItem(props: PermissionDecisionInfoItemProps): JSX.Element {
  function formatDecisionReason(): JSX.Element {
    switch (props.decisionReason.type) {
      case 'subcommandResults': {
        return (
          <box flexDirection="column">
            <For each={Array.from(props.decisionReason.reasons.entries())}>
              {([subcommand, result]) => {
                const icon =
                  result.behavior === 'allow'
                    ? chalk.green(figures.tick)
                    : chalk.red(figures.cross)
                return (
                  <box flexDirection="column">
                    <text>
                      {icon} {subcommand}
                    </text>
                    <Show
                      when={
                        result.decisionReason !== undefined &&
                        result.decisionReason.type !== 'subcommandResults'
                      }
                    >
                      <text>
                        <text dimmed>{'  '}\u23BF{'  '}</text>
                        {decisionReasonDisplayString(result.decisionReason as any)}
                      </text>
                    </Show>
                    <Show when={result.behavior === 'ask'}>
                      <SuggestedRules suggestions={result.suggestions} />
                    </Show>
                  </box>
                )
              }}
            </For>
          </box>
        )
      }
      default:
        return <text>{decisionReasonDisplayString(props.decisionReason as any)}</text>
    }
  }

  return (
    <box flexDirection="column">
      <Show when={props.title}>
        <text>{props.title}</text>
      </Show>
      {formatDecisionReason()}
    </box>
  )
}

function SuggestedRules(props: { suggestions?: PermissionUpdate[] }): JSX.Element {
  const rules = () => extractRules(props.suggestions)
  if (rules().length === 0) return null

  return (
    <text>
      <text dimmed>{'  '}\u23BF{'  '}</text>
      Suggested rules:{' '}
      {rules()
        .map((rule) => chalk.bold(permissionRuleValueToString(rule)))
        .join(', ')}
    </text>
  )
}

// Helper function to extract directories from permission updates
function extractDirectories(updates: PermissionUpdate[] | undefined): string[] {
  if (!updates) return []
  return updates.flatMap((update) => {
    switch (update.type) {
      case 'addDirectories':
        return update.directories
      default:
        return []
    }
  })
}

// Helper function to extract mode from permission updates
function extractMode(updates: PermissionUpdate[] | undefined): PermissionMode | undefined {
  if (!updates) return undefined
  const update = updates.findLast((u) => u.type === 'setMode')
  return update?.type === 'setMode' ? update.mode : undefined
}

function SuggestionDisplay(props: {
  suggestions?: PermissionUpdate[]
  width: number
}): JSX.Element {
  if (!props.suggestions || props.suggestions.length === 0) {
    return (
      <box flexDirection="row">
        <box justifyContent="flex-end" minWidth={props.width}>
          <text dimmed>Suggestions </text>
        </box>
        <text>None</text>
      </box>
    )
  }

  const rules = () => extractRules(props.suggestions)
  const directories = () => extractDirectories(props.suggestions)
  const mode = () => extractMode(props.suggestions)

  if (rules().length === 0 && directories().length === 0 && !mode()) {
    return (
      <box flexDirection="row">
        <box justifyContent="flex-end" minWidth={props.width}>
          <text dimmed>Suggestion </text>
        </box>
        <text>None</text>
      </box>
    )
  }

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <box justifyContent="flex-end" minWidth={props.width}>
          <text dimmed>Suggestions </text>
        </box>
        <text> </text>
      </box>
      <Show when={rules().length > 0}>
        <box flexDirection="row">
          <box justifyContent="flex-end" minWidth={props.width}>
            <text dimmed> Rules </text>
          </box>
          <box flexDirection="column">
            <For each={rules()}>
              {(rule) => (
                <text>
                  {figures.bullet} {permissionRuleValueToString(rule)}
                </text>
              )}
            </For>
          </box>
        </box>
      </Show>
      <Show when={directories().length > 0}>
        <box flexDirection="row">
          <box justifyContent="flex-end" minWidth={props.width}>
            <text dimmed> Directories </text>
          </box>
          <box flexDirection="column">
            <For each={directories()}>
              {(dir) => (
                <text>
                  {figures.bullet} {dir}
                </text>
              )}
            </For>
          </box>
        </box>
      </Show>
      <Show when={mode()}>
        <box flexDirection="row">
          <box justifyContent="flex-end" minWidth={props.width}>
            <text dimmed> Mode </text>
          </box>
          <text>{permissionModeTitle(mode()!)}</text>
        </box>
      </Show>
    </box>
  )
}

type Props = {
  permissionResult: PermissionDecision
  toolName?: string
}

export function PermissionDecisionDebugInfo(props: Props): JSX.Element {
  const toolPermissionContext = useAppState((s) => s.toolPermissionContext)

  const decisionReason = () => props.permissionResult.decisionReason
  const suggestions = () =>
    'suggestions' in props.permissionResult ? props.permissionResult.suggestions : undefined

  const unreachableRules = () => {
    const sandboxAutoAllowEnabled =
      SandboxManager.isSandboxingEnabled() && SandboxManager.isAutoAllowBashIfSandboxedEnabled()
    const all = detectUnreachableRules(toolPermissionContext, { sandboxAutoAllowEnabled })
    const suggestedRules = extractRules(suggestions())
    if (suggestedRules.length > 0) {
      return all.filter((u) =>
        suggestedRules.some(
          (suggested) =>
            suggested.toolName === u.rule.ruleValue.toolName &&
            suggested.ruleContent === u.rule.ruleValue.ruleContent,
        ),
      )
    }
    if (props.toolName) {
      return all.filter((u) => u.rule.ruleValue.toolName === props.toolName)
    }
    return all
  }

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <box justifyContent="flex-end" minWidth={10}>
          <text dimmed>Behavior </text>
        </box>
        <text>{props.permissionResult.behavior}</text>
      </box>
      <Show when={props.permissionResult.behavior !== 'allow'}>
        <box flexDirection="row">
          <box justifyContent="flex-end" minWidth={10}>
            <text dimmed>Message </text>
          </box>
          <text>{props.permissionResult.message}</text>
        </box>
      </Show>
      <box flexDirection="row">
        <box justifyContent="flex-end" minWidth={10}>
          <text dimmed>Reason </text>
        </box>
        {decisionReason() === undefined ? (
          <text>undefined</text>
        ) : (
          <PermissionDecisionInfoItem decisionReason={decisionReason()!} />
        )}
      </box>
      <SuggestionDisplay suggestions={suggestions()} width={10} />
      <Show when={unreachableRules().length > 0}>
        <box flexDirection="column" marginTop={1}>
          <text fg="warning">
            {figures.warning} Unreachable Rules ({unreachableRules().length})
          </text>
          <For each={unreachableRules()}>
            {(u) => (
              <box flexDirection="column" marginLeft={2}>
                <text fg="warning">{permissionRuleValueToString(u.rule.ruleValue)}</text>
                <text dimmed>{'  '}{u.reason}</text>
                <text dimmed>{'  '}Fix: {u.fix}</text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
