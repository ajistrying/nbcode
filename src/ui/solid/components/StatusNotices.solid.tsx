import type { JSX } from '@opentui/solid'
import { Show, For } from 'solid-js'
import { use } from 'react'
import type { AgentDefinitionsResult } from '../../../tools/AgentTool/loadAgentsDir.js'
import { getMemoryFiles } from '../../../utils/claudemd.js'
import { getGlobalConfig } from '../../../utils/config.js'
import {
  getActiveNotices,
  type StatusNoticeContext,
} from '../../../utils/statusNoticeDefinitions.js'

type Props = {
  agentDefinitions?: AgentDefinitionsResult
}

/**
 * StatusNotices contains the information displayed to users at startup.
 */
export function StatusNotices(props: Props = {}): JSX.Element {
  const context: StatusNoticeContext = {
    config: getGlobalConfig(),
    agentDefinitions: props.agentDefinitions,
    memoryFiles: use(getMemoryFiles()),
  }
  const activeNotices = getActiveNotices(context)

  return (
    <Show when={activeNotices.length > 0}>
      <box flexDirection="column" paddingLeft={1}>
        <For each={activeNotices}>{(notice) => (
          <>{notice.render(context)}</>
        )}</For>
      </box>
    </Show>
  ) as JSX.Element
}
