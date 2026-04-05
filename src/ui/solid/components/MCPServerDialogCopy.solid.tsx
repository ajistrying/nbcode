import type { JSX } from '@opentui/solid'
import { Link } from '../../../ink.js'

export function MCPServerDialogCopy(): JSX.Element {
  return (
    <text>
      MCP servers may execute code or access system resources. All tool calls
      require approval. Learn more in the{' '}
      <Link url="https://code.claude.com/docs/en/mcp">MCP documentation</Link>.
    </text>
  )
}
