import { createSignal } from 'solid-js'
import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { type ChannelEntry, getAllowedChannels, getHasDevChannels } from '../../../bootstrap/state.js'
import { isChannelsEnabled } from '../../../services/mcp/channelAllowlist.js'
import { getEffectiveChannelAllowlist } from '../../../services/mcp/channelNotification.js'
import { getMcpConfigsByScope } from '../../../services/mcp/config.js'
import { getClaudeAIOAuthTokens, getSubscriptionType } from '../../../utils/auth.js'
import { loadInstalledPluginsV2 } from '../../../utils/plugins/installedPluginsManager.js'
import { getSettingsForSource } from '../../../utils/settings/settings.js'

function formatEntry(c: ChannelEntry): string {
  return c.kind === 'plugin' ? `plugin:${c.name}@${c.marketplace}` : `server:${c.name}`
}

type Unmatched = {
  entry: ChannelEntry
  why: string
}

function findUnmatched(
  entries: readonly ChannelEntry[],
  allowlist: ReturnType<typeof getEffectiveChannelAllowlist>,
): Unmatched[] {
  const allServerNames = new Set<string>()
  for (const scope of ['user', 'project', 'mcpServers'] as const) {
    const configs = getMcpConfigsByScope(scope)
    if (configs) {
      for (const name of Object.keys(configs)) {
        allServerNames.add(name)
      }
    }
  }
  const plugins = loadInstalledPluginsV2()
  const result: Unmatched[] = []
  for (const e of entries) {
    if (e.kind === 'plugin') {
      const found = plugins.some(
        (p: any) => p.name === e.name && p.marketplace === e.marketplace,
      )
      if (!found) {
        result.push({ entry: e, why: 'plugin not installed' })
      } else if (allowlist && !allowlist.plugins?.includes(`${e.name}@${e.marketplace}`)) {
        result.push({ entry: e, why: 'not in channel allowlist' })
      }
    } else {
      if (!allServerNames.has(e.name)) {
        result.push({ entry: e, why: 'server not configured' })
      }
    }
  }
  return result
}

function computeInitialState() {
  const ch = getAllowedChannels()
  if (ch.length === 0) {
    return {
      channels: ch,
      disabled: false,
      noAuth: false,
      policyBlocked: false,
      list: '',
      unmatched: [] as Unmatched[],
    }
  }
  const l = ch.map(formatEntry).join(', ')
  const sub = getSubscriptionType()
  const managed = sub === 'team' || sub === 'enterprise'
  const policy = getSettingsForSource('policySettings')
  const allowlist = getEffectiveChannelAllowlist(sub, policy?.allowedChannelPlugins)
  return {
    channels: ch,
    disabled: !isChannelsEnabled(),
    noAuth: !getClaudeAIOAuthTokens()?.accessToken,
    policyBlocked: managed && policy?.channelsEnabled !== true,
    list: l,
    unmatched: findUnmatched(ch, allowlist),
  }
}

export function ChannelsNotice(): JSX.Element {
  const [state] = createSignal(computeInitialState())

  const channels = () => state().channels
  const disabled = () => state().disabled
  const noAuth = () => state().noAuth
  const policyBlocked = () => state().policyBlocked
  const list = () => state().list
  const unmatched = () => state().unmatched

  const hasNonDev = () => channels().some((c: ChannelEntry) => !c.dev)
  const flag = () =>
    getHasDevChannels() && hasNonDev()
      ? 'Channels'
      : getHasDevChannels()
        ? '--dangerously-load-development-channels'
        : '--channels'

  return (
    <Show when={channels().length > 0}>
      <Show when={disabled()}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="red">{flag()} ignored ({list()})</text>
          <text dimmed>Channels are not currently available</text>
        </box>
      </Show>
      <Show when={!disabled() && noAuth()}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="red">{flag()} ignored ({list()})</text>
          <text dimmed>Channels require claude.ai authentication · run /login, then restart</text>
        </box>
      </Show>
      <Show when={!disabled() && !noAuth() && policyBlocked()}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="red">{flag()} blocked by org policy ({list()})</text>
          <text dimmed>Inbound messages will be silently dropped</text>
          <text dimmed>Have an administrator set channelsEnabled: true in managed settings to enable</text>
          <For each={unmatched()}>
            {(u) => (
              <text fg="yellow">{formatEntry(u.entry)} · {u.why}</text>
            )}
          </For>
        </box>
      </Show>
      <Show when={!disabled() && !noAuth() && !policyBlocked()}>
        <box paddingLeft={2} flexDirection="column">
          <text fg="red">Listening for channel messages from: {list()}</text>
          <text dimmed>
            Experimental · inbound messages will be pushed into this session, this carries prompt injection risks. Restart Noble Base Code without {flag()} to disable.
          </text>
          <For each={unmatched()}>
            {(u) => (
              <text fg="yellow">{formatEntry(u.entry)} · {u.why}</text>
            )}
          </For>
        </box>
      </Show>
    </Show>
  )
}
