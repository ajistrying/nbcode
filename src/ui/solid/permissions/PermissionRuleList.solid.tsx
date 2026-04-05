import chalk from 'chalk'
import figures from 'figures'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import {
  useAppState,
  useSetAppState,
} from 'src/state/AppState.js'
import {
  applyPermissionUpdate,
  persistPermissionUpdate,
} from 'src/utils/permissions/PermissionUpdate.js'
import type { PermissionUpdateDestination } from 'src/utils/permissions/PermissionUpdateSchema.js'
import type { CommandResultDisplay } from '../../../commands.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useSearchInput } from '../../../hooks/useSearchInput.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import {
  type AutoModeDenial,
  getAutoModeDenials,
} from '../../../utils/autoModeDenials.js'
import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleValue,
} from '../../../utils/permissions/PermissionRule.js'
import { permissionRuleValueToString } from '../../../utils/permissions/permissionRuleParser.js'
import {
  deletePermissionRule,
  getAllowRules,
  getAskRules,
  getDenyRules,
  permissionRuleSourceDisplayString,
} from '../../../utils/permissions/permissions.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import type { Option } from '../../../components/ui/option.js'

type TabType = 'recent' | 'allow' | 'ask' | 'deny' | 'workspace'

function RuleSourceText(props: { rule: PermissionRule }) {
  return (
    <text dimmed>
      From {permissionRuleSourceDisplayString(props.rule.source)}
    </text>
  )
}

function getRuleBehaviorLabel(
  ruleBehavior: PermissionBehavior,
): string {
  switch (ruleBehavior) {
    case 'allow':
      return 'allowed'
    case 'deny':
      return 'denied'
    case 'ask':
      return 'ask'
  }
}

function RuleDetails(props: {
  rule: PermissionRule
  onDelete: () => void
  onCancel: () => void
}) {
  const exitState = useExitOnCtrlCDWithKeybindings()

  useKeybinding('confirm:no', props.onCancel, {
    context: 'Confirmation',
  })

  const ruleDescription = (
    <box flexDirection="column" marginX={2}>
      <text>
        <b>{permissionRuleValueToString(props.rule.ruleValue)}</b>
      </text>
      <RuleSourceText rule={props.rule} />
    </box>
  )

  const footer = (
    <box marginLeft={3}>
      <Show
        when={exitState.pending}
        fallback={<text dimmed>Esc to cancel</text>}
      >
        <text dimmed>
          Press {exitState.keyName} again to exit
        </text>
      </Show>
    </box>
  )

  if (props.rule.source === 'policySettings') {
    return (
      <>
        <box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          paddingLeft={1}
          paddingRight={1}
          borderColor="permission"
        >
          <text fg="permission">
            <b>Rule details</b>
          </text>
          {ruleDescription}
          <text>
            This rule is configured by managed settings and cannot be
            modified. Contact your system administrator for more
            information.
          </text>
        </box>
        {footer}
      </>
    )
  }

  return (
    <>
      <box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        paddingLeft={1}
        paddingRight={1}
        borderColor="error"
      >
        <text fg="error">
          <b>Delete {getRuleBehaviorLabel(props.rule.ruleBehavior)} tool?</b>
        </text>
        {ruleDescription}
        <text>
          Are you sure you want to delete this permission rule?
        </text>
        {/* Select Yes/No would go here */}
        <text dimmed>
          [Select Yes/No - port Select component separately]
        </text>
      </box>
      {footer}
    </>
  )
}

type Props = {
  onExit: (
    result?: string,
    options?: {
      display?: CommandResultDisplay
      shouldQuery?: boolean
      metaMessages?: string[]
    },
  ) => void
  initialTab?: TabType
  onRetryDenials?: (commands: string[]) => void
}

export function PermissionRuleList(props: Props) {
  const hasDenials = getAutoModeDenials().length > 0
  const defaultTab = () =>
    props.initialTab ?? (hasDenials ? 'recent' : 'allow')

  const [changes, setChanges] = createSignal<string[]>([])
  const toolPermissionContext = useAppState(
    (s) => s.toolPermissionContext,
  )
  const setAppState = useSetAppState()

  let denialStateRef = {
    approved: new Set<number>(),
    retry: new Set<number>(),
    denials: [] as AutoModeDenial[],
  }

  const handleDenialStateChange = (s: typeof denialStateRef) => {
    denialStateRef = s
  }

  const [selectedRule, setSelectedRule] = createSignal<
    PermissionRule | undefined
  >()
  const [lastFocusedRuleKey, setLastFocusedRuleKey] = createSignal<
    string | undefined
  >()
  const [addingRuleToTab, setAddingRuleToTab] = createSignal<
    TabType | null
  >(null)
  const [validatedRule, setValidatedRule] = createSignal<{
    ruleValue: PermissionRuleValue
    ruleBehavior: PermissionBehavior
  } | null>(null)
  const [isAddingWorkspaceDirectory, setIsAddingWorkspaceDirectory] =
    createSignal(false)
  const [removingDirectory, setRemovingDirectory] = createSignal<
    string | null
  >(null)
  const [isSearchMode, setIsSearchMode] = createSignal(false)
  const [headerFocused, setHeaderFocused] = createSignal(true)

  const handleHeaderFocusChange = (focused: boolean) => {
    setHeaderFocused(focused)
  }

  const allowRulesByKey = createMemo(() => {
    const map = new Map<string, PermissionRule>()
    getAllowRules(toolPermissionContext).forEach((rule) => {
      map.set(jsonStringify(rule), rule)
    })
    return map
  })

  const denyRulesByKey = createMemo(() => {
    const map = new Map<string, PermissionRule>()
    getDenyRules(toolPermissionContext).forEach((rule) => {
      map.set(jsonStringify(rule), rule)
    })
    return map
  })

  const askRulesByKey = createMemo(() => {
    const map = new Map<string, PermissionRule>()
    getAskRules(toolPermissionContext).forEach((rule) => {
      map.set(jsonStringify(rule), rule)
    })
    return map
  })

  const getRulesOptions = (tab: TabType, query = '') => {
    const rulesByKey = (() => {
      switch (tab) {
        case 'allow':
          return allowRulesByKey()
        case 'deny':
          return denyRulesByKey()
        case 'ask':
          return askRulesByKey()
        case 'workspace':
        case 'recent':
          return new Map<string, PermissionRule>()
      }
    })()

    const options: Option[] = []
    if (
      tab !== 'workspace' &&
      tab !== 'recent' &&
      !query
    ) {
      options.push({
        label: `Add a new rule${figures.ellipsis}`,
        value: 'add-new-rule',
      })
    }

    const sortedRuleKeys = Array.from(rulesByKey.keys()).sort(
      (a, b) => {
        const ruleA = rulesByKey.get(a)
        const ruleB = rulesByKey.get(b)
        if (ruleA && ruleB) {
          const ruleAString = permissionRuleValueToString(
            ruleA.ruleValue,
          ).toLowerCase()
          const ruleBString = permissionRuleValueToString(
            ruleB.ruleValue,
          ).toLowerCase()
          return ruleAString.localeCompare(ruleBString)
        }
        return 0
      },
    )

    const lowerQuery = query.toLowerCase()
    for (const ruleKey of sortedRuleKeys) {
      const rule = rulesByKey.get(ruleKey)
      if (rule) {
        const ruleString = permissionRuleValueToString(
          rule.ruleValue,
        )
        if (
          query &&
          !ruleString.toLowerCase().includes(lowerQuery)
        ) {
          continue
        }
        options.push({
          label: ruleString,
          value: ruleKey,
        })
      }
    }
    return { options, rulesByKey }
  }

  const exitState = useExitOnCtrlCDWithKeybindings()

  const isSearchModeActive = () =>
    !selectedRule() &&
    !addingRuleToTab() &&
    !validatedRule() &&
    !isAddingWorkspaceDirectory() &&
    !removingDirectory()

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: isSearchModeActive() && isSearchMode(),
    onExit: () => setIsSearchMode(false),
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isSearchModeActive()) return
    if (isSearchMode()) return
    if (e.ctrl || e.meta) return
    if (e.key === '/') {
      e.preventDefault()
      setIsSearchMode(true)
      setSearchQuery('')
    } else if (
      e.key.length === 1 &&
      e.key !== 'j' &&
      e.key !== 'k' &&
      e.key !== 'm' &&
      e.key !== 'i' &&
      e.key !== 'r' &&
      e.key !== ' '
    ) {
      e.preventDefault()
      setIsSearchMode(true)
      setSearchQuery(e.key)
    }
  }

  const handleToolSelect = (
    selectedValue: string,
    tab: TabType,
  ) => {
    const { rulesByKey } = getRulesOptions(tab)
    if (selectedValue === 'add-new-rule') {
      setAddingRuleToTab(tab)
      return
    }
    setSelectedRule(rulesByKey.get(selectedValue))
  }

  const handleRuleInputCancel = () => {
    setAddingRuleToTab(null)
  }

  const handleRuleInputSubmit = (
    ruleValue: PermissionRuleValue,
    ruleBehavior: PermissionBehavior,
  ) => {
    setValidatedRule({ ruleValue, ruleBehavior })
    setAddingRuleToTab(null)
  }

  const handleAddRulesSuccess = (
    rules: PermissionRule[],
    unreachable?: Array<{
      rule: PermissionRule
      shadowType: string
      reason: string
      fix: string
    }>,
  ) => {
    setValidatedRule(null)
    for (const rule of rules) {
      setChanges((prev) => [
        ...prev,
        `Added ${rule.ruleBehavior} rule ${chalk.bold(permissionRuleValueToString(rule.ruleValue))}`,
      ])
    }
    if (unreachable && unreachable.length > 0) {
      for (const u of unreachable) {
        const severity =
          u.shadowType === 'deny' ? 'blocked' : 'shadowed'
        setChanges((prev) => [
          ...prev,
          chalk.yellow(
            `${figures.warning} Warning: ${permissionRuleValueToString(u.rule.ruleValue)} is ${severity}`,
          ),
          chalk.dim(`  ${u.reason}`),
          chalk.dim(`  Fix: ${u.fix}`),
        ])
      }
    }
  }

  const handleAddRuleCancel = () => {
    setValidatedRule(null)
  }

  const handleRequestAddDirectory = () =>
    setIsAddingWorkspaceDirectory(true)
  const handleRequestRemoveDirectory = (path: string) =>
    setRemovingDirectory(path)

  const handleRulesCancel = () => {
    const s = denialStateRef
    const denialsFor = (set: Set<number>) =>
      Array.from(set)
        .map((idx) => s.denials[idx])
        .filter((d): d is AutoModeDenial => d !== undefined)
    const retryDenials = denialsFor(s.retry)
    if (retryDenials.length > 0) {
      const commands = retryDenials.map((d) => d.display)
      props.onRetryDenials?.(commands)
      props.onExit(undefined, {
        shouldQuery: true,
        metaMessages: [
          `Permission granted for: ${commands.join(', ')}. You may now retry ${commands.length === 1 ? 'this command' : 'these commands'} if you would like.`,
        ],
      })
      return
    }
    const approvedDenials = denialsFor(s.approved)
    if (approvedDenials.length > 0 || changes().length > 0) {
      const approvedMsg =
        approvedDenials.length > 0
          ? [
              `Approved ${approvedDenials.map((d) => chalk.bold(d.display)).join(', ')}`,
            ]
          : []
      props.onExit([...approvedMsg, ...changes()].join('\n'))
    } else {
      props.onExit('Permissions dialog dismissed', {
        display: 'system',
      })
    }
  }

  useKeybinding('confirm:no', handleRulesCancel, {
    context: 'Settings',
    isActive: isSearchModeActive() && !isSearchMode(),
  })

  const handleDeleteRule = () => {
    const rule = selectedRule()
    if (!rule) return
    const { options } = getRulesOptions(
      rule.ruleBehavior as TabType,
    )
    const selectedKey = jsonStringify(rule)
    const ruleKeys = options
      .filter((opt) => opt.value !== 'add-new-rule')
      .map((opt) => opt.value)
    const currentIndex = ruleKeys.indexOf(selectedKey)
    let nextFocusKey: string | undefined
    if (currentIndex !== -1) {
      if (currentIndex < ruleKeys.length - 1) {
        nextFocusKey = ruleKeys[currentIndex + 1]
      } else if (currentIndex > 0) {
        nextFocusKey = ruleKeys[currentIndex - 1]
      }
    }
    setLastFocusedRuleKey(nextFocusKey)
    deletePermissionRule({
      rule,
      initialContext: toolPermissionContext,
      setToolPermissionContext(ctx) {
        setAppState((prev) => ({
          ...prev,
          toolPermissionContext: ctx,
        }))
      },
    })
    setChanges((prev) => [
      ...prev,
      `Deleted ${rule.ruleBehavior} rule ${chalk.bold(permissionRuleValueToString(rule.ruleValue))}`,
    ])
    setSelectedRule(undefined)
  }

  // Render selected rule details
  if (selectedRule()) {
    return (
      <RuleDetails
        rule={selectedRule()!}
        onDelete={handleDeleteRule}
        onCancel={() => setSelectedRule(undefined)}
      />
    )
  }

  // Render adding rule input
  if (
    addingRuleToTab() &&
    addingRuleToTab() !== 'workspace' &&
    addingRuleToTab() !== 'recent'
  ) {
    return (
      <box flexDirection="column">
        <text dimmed>
          [PermissionRuleInput - port separately] Adding to{' '}
          {addingRuleToTab()} tab
        </text>
      </box>
    )
  }

  // Render validated rule confirmation
  if (validatedRule()) {
    return (
      <box flexDirection="column">
        <text dimmed>
          [AddPermissionRules - port separately]
        </text>
      </box>
    )
  }

  // Render adding workspace directory
  if (isAddingWorkspaceDirectory()) {
    return (
      <box flexDirection="column">
        <text dimmed>
          [AddWorkspaceDirectory - port separately]
        </text>
      </box>
    )
  }

  // Render removing directory confirmation
  if (removingDirectory()) {
    return (
      <box flexDirection="column">
        <text dimmed>
          [RemoveWorkspaceDirectory - port separately] Removing{' '}
          {removingDirectory()}
        </text>
      </box>
    )
  }

  // Main tabbed view
  const isHidden = () =>
    !!selectedRule() ||
    !!addingRuleToTab() ||
    !!validatedRule() ||
    isAddingWorkspaceDirectory() ||
    !!removingDirectory()

  return (
    <box flexDirection="column" onKeyDown={handleKeyDown}>
      <box flexDirection="column">
        {/* Tabs component would go here */}
        <text fg="permission">
          <b>Permissions:</b>
        </text>
        <text dimmed>
          Tabs: Recent | Allow | Ask | Deny | Workspace (default:{' '}
          {defaultTab()})
        </text>
        {/* Tab content with rules lists */}
        <text dimmed>
          [Tabs + PermissionRulesTab - port Tab/Tabs components
          separately]
        </text>
      </box>
      <box marginTop={1} paddingLeft={1}>
        <text dimmed>
          <Show
            when={!exitState.pending}
            fallback={
              <>Press {exitState.keyName} again to exit</>
            }
          >
            <Show
              when={!headerFocused()}
              fallback={
                <>
                  {figures.arrowLeft}/{figures.arrowRight} tab
                  switch · {figures.arrowDown} return · Esc cancel
                </>
              }
            >
              <Show
                when={!isSearchMode()}
                fallback={
                  <>
                    Type to filter · Enter/{figures.arrowDown} select
                    · {figures.arrowUp} tabs · Esc clear
                  </>
                }
              >
                {figures.arrowUp}
                {figures.arrowDown} navigate · Enter select · Type to
                search · {figures.arrowLeft}/{figures.arrowRight}{' '}
                switch · Esc cancel
              </Show>
            </Show>
          </Show>
        </text>
      </box>
    </box>
  )
}
