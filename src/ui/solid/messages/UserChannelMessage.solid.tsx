import type { JSX } from '@opentui/solid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { CHANNEL_ARROW } from '../../../constants/figures.js'
import { CHANNEL_TAG } from '../../../constants/xml.js'
import { truncateToWidth } from '../../../utils/format.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

const CHANNEL_RE = new RegExp(`<${CHANNEL_TAG}\\s+source="([^"]+)"([^>]*)>\\n?([\\s\\S]*?)\\n?</${CHANNEL_TAG}>`)
const USER_ATTR_RE = /\buser="([^"]+)"/

function displayServerName(name: string): string {
  const i = name.lastIndexOf(':')
  return i === -1 ? name : name.slice(i + 1)
}

const TRUNCATE_AT = 60

export function UserChannelMessage(props: Props): JSX.Element {
  const text = () => props.param.text
  const m = () => CHANNEL_RE.exec(text())

  if (!m()) return null

  const source = () => m()![1] ?? ''
  const attrs = () => m()![2] ?? ''
  const content = () => m()![3] ?? ''
  const user = () => USER_ATTR_RE.exec(attrs())?.[1]
  const body = () => content().trim().replace(/\s+/g, ' ')
  const truncated = () => truncateToWidth(body(), TRUNCATE_AT)

  return (
    <box marginTop={props.addMargin ? 1 : 0}>
      <text>
        <text fg="suggestion">{CHANNEL_ARROW}</text>{' '}
        <text dimmed>
          {displayServerName(source())}
          {user() ? ` \u00b7 ${user()}` : ''}:
        </text>{' '}
        {truncated()}
      </text>
    </box>
  )
}
