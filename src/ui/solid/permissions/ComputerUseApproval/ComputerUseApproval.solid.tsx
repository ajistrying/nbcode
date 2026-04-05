import { createSignal, Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getSentinelCategory } from '@ant/computer-use-mcp/sentinelApps'
import type {
  CuPermissionRequest,
  CuPermissionResponse,
} from '@ant/computer-use-mcp/types'
import { DEFAULT_GRANT_FLAGS } from '@ant/computer-use-mcp/types'
import figures from 'figures'
import { execFileNoThrow } from '../../../../utils/execFileNoThrow.js'
import { plural } from '../../../../utils/stringUtils.js'
import type { OptionWithDescription } from '../../../../components/CustomSelect/select.js'
import { Select } from '../../../../components/CustomSelect/select.js'
import { Dialog } from '../../../design-system/Dialog.js'

type ComputerUseApprovalProps = {
  request: CuPermissionRequest
  onDone: (response: CuPermissionResponse) => void
}

const DENY_ALL_RESPONSE: CuPermissionResponse = {
  granted: [],
  denied: [],
  flags: DEFAULT_GRANT_FLAGS,
}

/**
 * Two-panel dispatcher. When request.tccState is present, show TCC panel;
 * otherwise show app allowlist + grant-flags panel.
 */
export function ComputerUseApproval(props: ComputerUseApprovalProps): JSX.Element {
  return (
    <Show
      when={!props.request.tccState}
      fallback={
        <ComputerUseTccPanel
          tccState={props.request.tccState!}
          onDone={() => props.onDone(DENY_ALL_RESPONSE)}
        />
      }
    >
      <ComputerUseAppListPanel request={props.request} onDone={props.onDone} />
    </Show>
  )
}

// ── TCC panel ─────────────────────────────────────────────────────────────

type TccOption = 'open_accessibility' | 'open_screen_recording' | 'retry'

function ComputerUseTccPanel(props: {
  tccState: NonNullable<CuPermissionRequest['tccState']>
  onDone: () => void
}): JSX.Element {
  const options = () => {
    const opts: Array<{ label: string; value: TccOption }> = []
    if (!props.tccState.accessibility) {
      opts.push({
        label: 'Open System Settings \u2192 Accessibility',
        value: 'open_accessibility',
      })
    }
    if (!props.tccState.screenRecording) {
      opts.push({
        label: 'Open System Settings \u2192 Screen Recording',
        value: 'open_screen_recording',
      })
    }
    opts.push({ label: 'Try again', value: 'retry' })
    return opts
  }

  function onChange(value: TccOption) {
    switch (value) {
      case 'open_accessibility':
        execFileNoThrow(
          'open',
          ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'],
          { useCwd: false },
        )
        return
      case 'open_screen_recording':
        execFileNoThrow(
          'open',
          ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'],
          { useCwd: false },
        )
        return
      case 'retry':
        props.onDone()
        return
    }
  }

  return (
    <Dialog title="Computer Use needs macOS permissions" onCancel={props.onDone}>
      <box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <box flexDirection="column">
          <text>
            Accessibility:{' '}
            {props.tccState.accessibility
              ? `${figures.tick} granted`
              : `${figures.cross} not granted`}
          </text>
          <text>
            Screen Recording:{' '}
            {props.tccState.screenRecording
              ? `${figures.tick} granted`
              : `${figures.cross} not granted`}
          </text>
        </box>
        <text dimmed>
          Grant the missing permissions in System Settings, then select "Try again". macOS may
          require you to restart Claude Code after granting Screen Recording.
        </text>
        <Select options={options()} onChange={onChange} onCancel={props.onDone} />
      </box>
    </Dialog>
  )
}

// ── App allowlist panel ───────────────────────────────────────────────────

type AppListOption = 'allow_all' | 'deny'

const SENTINEL_WARNING: Record<
  NonNullable<ReturnType<typeof getSentinelCategory>>,
  string
> = {
  shell: 'equivalent to shell access',
  filesystem: 'can read/write any file',
  system_settings: 'can change system settings',
}

/**
 * NOTE: useState x1 in original (lazy init for checked set).
 */
function ComputerUseAppListPanel(props: {
  request: CuPermissionRequest
  onDone: (response: CuPermissionResponse) => void
}): JSX.Element {
  // useState with lazy init -> createSignal with immediate init
  const [checked] = createSignal(
    new Set(
      props.request.apps.flatMap((a) =>
        a.resolved && !a.alreadyGranted ? [a.resolved.bundleId] : [],
      ),
    ),
  )

  const ALL_FLAG_KEYS = ['clipboardRead', 'clipboardWrite', 'systemKeyCombos'] as const
  const requestedFlagKeys = () =>
    ALL_FLAG_KEYS.filter((k) => props.request.requestedFlags[k])

  const options = (): Array<{ label: JSX.Element | string; value: AppListOption }> => [
    {
      label: `Allow for this session (${checked().size} ${plural(checked().size, 'app')})`,
      value: 'allow_all',
    },
    {
      label: (
        <text>
          Deny, and tell Claude what to do differently{' '}
          <text><b>(esc)</b></text>
        </text>
      ),
      value: 'deny',
    },
  ]

  function respond(allow: boolean) {
    if (!allow) {
      props.onDone(DENY_ALL_RESPONSE)
      return
    }
    const now = Date.now()
    const granted = props.request.apps.flatMap((a) =>
      a.resolved && checked().has(a.resolved.bundleId)
        ? [
            {
              bundleId: a.resolved.bundleId,
              displayName: a.resolved.displayName,
              grantedAt: now,
            },
          ]
        : [],
    )
    const denied = props.request.apps
      .filter((a) => !a.resolved || !checked().has(a.resolved.bundleId))
      .map((a) => ({
        bundleId: a.resolved?.bundleId ?? a.requestedName,
        reason: a.resolved ? ('user_denied' as const) : ('not_installed' as const),
      }))
    const flags = {
      ...DEFAULT_GRANT_FLAGS,
      ...Object.fromEntries(requestedFlagKeys().map((k) => [k, true] as const)),
    }
    props.onDone({ granted, denied, flags })
  }

  return (
    <Dialog title="Computer Use wants to control these apps" onCancel={() => respond(false)}>
      <box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Show when={props.request.reason}>
          <text dimmed>{props.request.reason}</text>
        </Show>
        <box flexDirection="column">
          <For each={props.request.apps}>
            {(a) => {
              const resolved = a.resolved
              if (!resolved) {
                return (
                  <text dimmed>
                    {'  '}
                    {figures.circle} {a.requestedName}{' '}
                    <text dimmed>(not installed)</text>
                  </text>
                )
              }
              if (a.alreadyGranted) {
                return (
                  <text dimmed>
                    {'  '}
                    {figures.tick} {resolved.displayName}{' '}
                    <text dimmed>(already granted)</text>
                  </text>
                )
              }
              const sentinel = getSentinelCategory(resolved.bundleId)
              const isChecked = checked().has(resolved.bundleId)
              return (
                <box flexDirection="column">
                  <text>
                    {'  '}
                    {isChecked ? figures.circleFilled : figures.circle} {resolved.displayName}
                  </text>
                  <Show when={sentinel}>
                    <text>
                      <b>
                        {'    '}
                        {figures.warning} {SENTINEL_WARNING[sentinel!]}
                      </b>
                    </text>
                  </Show>
                </box>
              )
            }}
          </For>
        </box>
        <Show when={requestedFlagKeys().length > 0}>
          <box flexDirection="column">
            <text dimmed>Also requested:</text>
            <For each={requestedFlagKeys()}>
              {(flag) => (
                <text dimmed>{'  '}\u00b7 {flag}</text>
              )}
            </For>
          </box>
        </Show>
        <Show when={props.request.willHide && props.request.willHide.length > 0}>
          <text dimmed>
            {props.request.willHide!.length} other{' '}
            {plural(props.request.willHide!.length, 'app')} will be hidden while Claude works.
          </text>
        </Show>
        <Select
          options={options()}
          onChange={(v: string) => respond(v === 'allow_all')}
          onCancel={() => respond(false)}
        />
      </box>
    </Dialog>
  )
}
