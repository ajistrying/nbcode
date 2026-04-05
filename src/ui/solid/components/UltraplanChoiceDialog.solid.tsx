import type { JSX } from '@opentui/solid'
import { useSetAppState } from '../../../state/AppState.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Message } from '../../../types/message.js'
import type { RemoteAgentTaskState } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { FileStateCache } from '../../../utils/fileStateCache.js'
import {
  createUserMessage,
  createSystemMessage,
  prepareUserContent,
} from '../../../utils/messages.js'
import { updateTaskState } from '../../../utils/task/framework.js'
import { archiveRemoteSession } from '../../../utils/teleport.js'
import { logForDebugging } from '../../../utils/debug.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type UltraplanChoice = 'execute' | 'dismiss'

type Props = {
  plan: string
  sessionId: string
  taskId: string
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  readFileState: FileStateCache
  getAppState: () => AppState
  setConversationId: (id: string) => void
}

export function UltraplanChoiceDialog(props: Props): JSX.Element {
  const setAppState = useSetAppState()

  const handleChoice = (choice: UltraplanChoice) => {
    if (choice === 'execute') {
      props.setMessages(prev => [
        ...prev,
        createSystemMessage(
          'Ultraplan approved. Executing the following plan:',
          'info',
        ),
        createUserMessage({
          content: prepareUserContent({ inputString: props.plan }),
        }),
      ])
    }

    updateTaskState<RemoteAgentTaskState>(props.taskId, setAppState, t =>
      t.status !== 'running'
        ? t
        : { ...t, status: 'completed', endTime: Date.now() },
    )

    setAppState(prev => ({
      ...prev,
      ultraplanPendingChoice: undefined,
      ultraplanSessionUrl: undefined,
    }))

    void archiveRemoteSession(props.sessionId).catch(e =>
      logForDebugging(`ultraplan choice archive failed: ${String(e)}`),
    )
  }

  const displayPlan = () =>
    props.plan.length > 2000
      ? props.plan.slice(0, 2000) + '\n\n... (truncated)'
      : props.plan

  return (
    <Dialog
      title="Ultraplan ready"
      onCancel={() => handleChoice('dismiss')}
    >
      <box flexDirection="column" gap={1}>
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          height={Math.min(displayPlan().split('\n').length + 2, 20)}
          overflow="hidden"
        >
          <text>{displayPlan()}</text>
        </box>
      </box>
      <Select
        options={[
          {
            value: 'execute' as const,
            label: 'Execute plan here',
            description:
              'Send the plan to Claude for execution in this session',
          },
          {
            value: 'dismiss' as const,
            label: 'Dismiss',
            description: 'Discard the plan',
          },
        ]}
        onChange={(value: string) => handleChoice(value as UltraplanChoice)}
      />
    </Dialog>
  )
}
