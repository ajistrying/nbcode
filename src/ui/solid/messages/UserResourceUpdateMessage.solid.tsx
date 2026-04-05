import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { REFRESH_ARROW } from '../../../constants/figures.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

type ParsedUpdate = {
  kind: 'resource' | 'polling'
  server: string
  target: string
  reason?: string
}

function parseUpdates(text: string): ParsedUpdate[] {
  const updates: ParsedUpdate[] = []
  const resourceRegex = /<mcp-resource-update\s+server="([^"]+)"\s+uri="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g
  let match
  while ((match = resourceRegex.exec(text)) !== null) {
    updates.push({ kind: 'resource', server: match[1] ?? '', target: match[2] ?? '', reason: match[3] })
  }
  const pollingRegex = /<mcp-polling-update\s+type="([^"]+)"\s+server="([^"]+)"\s+tool="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g
  while ((match = pollingRegex.exec(text)) !== null) {
    updates.push({ kind: 'polling', server: match[2] ?? '', target: match[3] ?? '', reason: match[4] })
  }
  return updates
}

function formatUri(uri: string): string {
  if (uri.startsWith('file://')) {
    const path = uri.slice(7)
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }
  if (uri.length > 40) {
    return uri.slice(0, 39) + '\u2026'
  }
  return uri
}

export function UserResourceUpdateMessage(props: Props): JSX.Element {
  const updates = () => parseUpdates(props.param.text)

  if (updates().length === 0) return null

  return (
    <box flexDirection="column" marginTop={props.addMargin ? 1 : 0}>
      <For each={updates()}>
        {(update) => (
          <box>
            <text>
              <text fg="success">{REFRESH_ARROW}</text>{' '}
              <text dimmed>{update.server}:</text>{' '}
              <text fg="suggestion">{update.kind === 'resource' ? formatUri(update.target) : update.target}</text>
              <Show when={update.reason}>
                <text dimmed> {"\u00b7"} {update.reason}</text>
              </Show>
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
