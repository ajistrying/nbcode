import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  Show,
  For,
  type JSXElement,
} from 'solid-js'
import type { ContentBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID, type UUID } from 'crypto'
import figures from 'figures'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { useAppState } from 'src/state/AppState.js'
import {
  type DiffStats,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
} from 'src/utils/fileHistory.js'
import { logError } from 'src/utils/log.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useKeybinding, useKeybindings } from '../../../keybindings/useKeybinding.js'
import type { Message, PartialCompactDirection, UserMessage } from '../../../types/message.js'
import { stripDisplayTags } from '../../../utils/displayTags.js'
import {
  createUserMessage,
  extractTag,
  isEmptyMessageText,
  isSyntheticMessage,
  isToolUseResultMessage,
} from '../../../utils/messages.js'
import { isToolCallBlock, isToolResultBlock } from '../../../utils/toolBlockCompat.js'
import { type OptionWithDescription, Select } from '../components/CustomSelect/select.js'
import { Spinner } from '../Spinner/index.js'
import * as path from 'path'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import type { FileEditOutput } from 'src/tools/FileEditTool/types.js'
import type { Output as FileWriteToolOutput } from 'src/tools/FileWriteTool/FileWriteTool.js'
import {
  BASH_STDERR_TAG,
  BASH_STDOUT_TAG,
  COMMAND_MESSAGE_TAG,
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
  TASK_NOTIFICATION_TAG,
  TEAMMATE_MESSAGE_TAG,
  TICK_TAG,
} from '../../../constants/xml.js'
import { count } from '../../../utils/array.js'
import { formatRelativeTimeAgo, truncate } from '../../../utils/format.js'
import type { Theme } from '../../../utils/theme.js'
import { Divider } from '../design-system/Divider.js'

function isTextBlock(block: ContentBlockParam): block is TextBlockParam {
  return block.type === 'text'
}

type RestoreOption =
  | 'both'
  | 'conversation'
  | 'code'
  | 'summarize'
  | 'summarize_up_to'
  | 'nevermind'

function isSummarizeOption(
  option: RestoreOption | null,
): option is 'summarize' | 'summarize_up_to' {
  return option === 'summarize' || option === 'summarize_up_to'
}

type Props = {
  messages: Message[]
  onPreRestore: () => void
  onRestoreMessage: (message: UserMessage) => Promise<void>
  onRestoreCode: (message: UserMessage) => Promise<void>
  onSummarize: (
    message: UserMessage,
    feedback?: string,
    direction?: PartialCompactDirection,
  ) => Promise<void>
  onClose: () => void
  preselectedMessage?: UserMessage
}

const MAX_VISIBLE_MESSAGES = 7

function selectableUserMessagesFilter(msg: Message): boolean {
  if (msg.type !== 'user') return false
  if (isSyntheticMessage(msg)) return false
  if (isToolUseResultMessage(msg)) return false
  const block = msg.message.content[0]
  if (!block || block.type !== 'text') return false
  if (isEmptyMessageText(block.text)) return false
  // Filter out XML-wrapped payloads
  const text = block.text.trim()
  if (
    text.startsWith(`<${BASH_STDOUT_TAG}>`) ||
    text.startsWith(`<${BASH_STDERR_TAG}>`) ||
    text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) ||
    text.startsWith(`<${TASK_NOTIFICATION_TAG}>`) ||
    text.startsWith(`<${TEAMMATE_MESSAGE_TAG}>`) ||
    text.startsWith(`<${TICK_TAG}>`) ||
    text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
    text.startsWith(`<${LOCAL_COMMAND_STDERR_TAG}>`)
  ) {
    return false
  }
  return true
}

export function MessageSelector(props: Props): JSXElement {
  const fileHistory = useAppState((s: any) => s.fileHistory)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const isFileHistoryEnabled = fileHistoryEnabled()

  const currentUUID = randomUUID()
  const messageOptions = createMemo(() => [
    ...props.messages.filter(selectableUserMessagesFilter),
    {
      ...createUserMessage({ content: '' }),
      uuid: currentUUID,
    } as UserMessage,
  ])

  const [selectedIndex, setSelectedIndex] = createSignal(messageOptions().length - 1)

  const firstVisibleIndex = createMemo(() =>
    Math.max(
      0,
      Math.min(
        selectedIndex() - Math.floor(MAX_VISIBLE_MESSAGES / 2),
        messageOptions().length - MAX_VISIBLE_MESSAGES,
      ),
    ),
  )

  const hasMessagesToSelect = createMemo(() => messageOptions().length > 1)
  const [messageToRestore, setMessageToRestore] = createSignal<UserMessage | undefined>(
    props.preselectedMessage,
  )
  const [diffStatsForRestore, setDiffStatsForRestore] = createSignal<DiffStats | undefined>(
    undefined,
  )
  const [isRestoring, setIsRestoring] = createSignal(false)
  const [restoringOption, setRestoringOption] = createSignal<RestoreOption | null>(null)
  const [selectedRestoreOption, setSelectedRestoreOption] = createSignal<RestoreOption>('both')
  const [summarizeFromFeedback, setSummarizeFromFeedback] = createSignal('')
  const [summarizeUpToFeedback, setSummarizeUpToFeedback] = createSignal('')

  // Load diff stats for preselected message
  createEffect(() => {
    if (!props.preselectedMessage || !isFileHistoryEnabled) return
    let cancelled = false
    void fileHistoryGetDiffStats(fileHistory, props.preselectedMessage.uuid).then(stats => {
      if (!cancelled) setDiffStatsForRestore(stats)
    })
    return () => {
      cancelled = true
    }
  })

  // Log when selector opens
  onMount(() => {
    logEvent('tengu_message_selector_opened', {})
  })

  const exitState = useExitOnCtrlCDWithKeybindings(props.onClose)

  async function restoreConversationDirectly(message: UserMessage) {
    props.onPreRestore()
    setIsRestoring(true)
    try {
      await props.onRestoreMessage(message)
      setIsRestoring(false)
      props.onClose()
    } catch (err) {
      logError(err as Error)
      setIsRestoring(false)
      setError(`Failed to restore the conversation:\n${err}`)
    }
  }

  async function handleSelect(message: UserMessage) {
    const index = props.messages.indexOf(message)
    const indexFromEnd = props.messages.length - 1 - index
    logEvent('tengu_message_selector_selected', {
      index_from_end: indexFromEnd,
      message_type:
        message.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      is_current_prompt: false,
    })

    if (!props.messages.includes(message)) {
      props.onClose()
      return
    }
    if (!isFileHistoryEnabled) {
      await restoreConversationDirectly(message)
      return
    }
    const diffStats = await fileHistoryGetDiffStats(fileHistory, message.uuid)
    setMessageToRestore(message)
    setDiffStatsForRestore(diffStats)
  }

  async function onSelectRestoreOption(option: RestoreOption) {
    logEvent('tengu_message_selector_restore_option_selected', {
      option: option as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    const msg = messageToRestore()
    if (!msg) {
      setError('Message not found.')
      return
    }
    if (option === 'nevermind') {
      if (props.preselectedMessage) props.onClose()
      else setMessageToRestore(undefined)
      return
    }
    if (isSummarizeOption(option)) {
      props.onPreRestore()
      setIsRestoring(true)
      setRestoringOption(option)
      setError(undefined)
      try {
        const direction = option === 'summarize_up_to' ? 'up_to' : 'from'
        const feedback = (
          direction === 'up_to' ? summarizeUpToFeedback() : summarizeFromFeedback()
        )
          .trim() || undefined
        await props.onSummarize(msg, feedback, direction)
        setIsRestoring(false)
        setRestoringOption(null)
        props.onClose()
      } catch (err) {
        logError(err as Error)
        setIsRestoring(false)
        setRestoringOption(null)
        setError(`Failed to summarize:\n${err}`)
      }
      return
    }
    props.onPreRestore()
    setIsRestoring(true)
    setRestoringOption(option)
    setError(undefined)
    try {
      if (option === 'both' || option === 'conversation') {
        await props.onRestoreMessage(msg)
      }
      if (option === 'both' || option === 'code') {
        await props.onRestoreCode(msg)
      }
      setIsRestoring(false)
      setRestoringOption(null)
      props.onClose()
    } catch (err) {
      logError(err as Error)
      setIsRestoring(false)
      setRestoringOption(null)
      setError(`Failed to restore:\n${err}`)
    }
  }

  function getRestoreOptions(canRestoreCode: boolean): OptionWithDescription<RestoreOption>[] {
    const baseOptions: OptionWithDescription<RestoreOption>[] = canRestoreCode
      ? [
          { value: 'both', label: 'Restore code and conversation' },
          { value: 'conversation', label: 'Restore conversation' },
          { value: 'code', label: 'Restore code' },
        ]
      : [{ value: 'conversation', label: 'Restore conversation' }]

    const summarizeInputProps = {
      type: 'input' as const,
      placeholder: 'add context (optional)',
      initialValue: '',
      allowEmptySubmitToCancel: true,
      showLabelWithValue: true,
      labelValueSeparator: ': ',
    }
    baseOptions.push({
      value: 'summarize',
      label: 'Summarize from here',
      ...summarizeInputProps,
      onChange: setSummarizeFromFeedback,
    })
    baseOptions.push({ value: 'nevermind', label: 'Never mind' })
    return baseOptions
  }

  // Navigate with keybindings
  useKeybindings(
    {
      'confirm:yes': () => {
        const msg = messageToRestore()
        if (msg) {
          void onSelectRestoreOption(selectedRestoreOption())
        } else {
          const opts = messageOptions()
          const idx = selectedIndex()
          const selected = opts[idx]
          if (selected && selected.uuid !== currentUUID) {
            void handleSelect(selected as UserMessage)
          }
        }
      },
      'confirm:no': () => {
        if (messageToRestore()) {
          if (props.preselectedMessage) props.onClose()
          else setMessageToRestore(undefined)
        } else {
          props.onClose()
        }
      },
    },
    { context: 'Confirmation' },
  )

  return (
    <box flexDirection="column">
      <Show when={error()}>
        <text fg="error">{error()}</text>
      </Show>

      <Show when={isRestoring()}>
        <box flexDirection="row" gap={1}>
          <Spinner />
          <text>
            {restoringOption() === 'code'
              ? 'Restoring code...'
              : restoringOption() === 'conversation'
                ? 'Restoring conversation...'
                : isSummarizeOption(restoringOption())
                  ? 'Summarizing...'
                  : 'Restoring...'}
          </text>
        </box>
      </Show>

      <Show when={!isRestoring() && messageToRestore()}>
        {/* Restore option selection */}
        <box flexDirection="column">
          <Divider />
          <text>
            <b>Restore to this point?</b>
          </text>
          <Show when={diffStatsForRestore()}>
            <text dimmed>
              {diffStatsForRestore()!.filesChanged} files changed,{' '}
              {diffStatsForRestore()!.insertions} insertions,{' '}
              {diffStatsForRestore()!.deletions} deletions
            </text>
          </Show>
          <Select
            options={getRestoreOptions(!!diffStatsForRestore()?.filesChanged)}
            onChange={(v: string) => void onSelectRestoreOption(v as RestoreOption)}
            onCancel={() => {
              if (props.preselectedMessage) props.onClose()
              else setMessageToRestore(undefined)
            }}
          />
        </box>
      </Show>

      <Show when={!isRestoring() && !messageToRestore() && hasMessagesToSelect()}>
        {/* Message list */}
        <box flexDirection="column">
          <text dimmed>Select a message to restore to:</text>
          <For each={messageOptions().slice(firstVisibleIndex(), firstVisibleIndex() + MAX_VISIBLE_MESSAGES)}>
            {(msg, i) => {
              const idx = () => firstVisibleIndex() + i()
              const isSelected = () => idx() === selectedIndex()
              const isCurrent = () => (msg as UserMessage).uuid === currentUUID
              const block = () => (msg as UserMessage).message.content[0]
              const text = () => {
                if (isCurrent()) return '(current prompt)'
                if (!block() || block()!.type !== 'text') return '...'
                return truncate(stripDisplayTags((block() as TextBlockParam).text), 60)
              }
              return (
                <text>
                  {isSelected() ? figures.pointer + ' ' : '  '}
                  {text()}
                </text>
              )
            }}
          </For>
        </box>
      </Show>
    </box>
  )
}
