/**
 * Feedback — SolidJS port of src/components/Feedback.tsx
 *
 * Bug report / feedback submission dialog with multi-step flow:
 * userInput -> consent -> submitting -> done
 */
import { createSignal, Show, type JSX } from 'solid-js'
import type { CommandResultDisplay } from '../../../commands.js'
import type { Message } from '../../../types/message.js'
import { env } from '../../../utils/env.js'
import type { GitRepoState } from '../../../utils/git.js'

// Re-export utility functions that don't involve React
export {
  redactSensitiveInfo,
  createGitHubIssueUrl,
} from '../../../components/Feedback.js'

type Step = 'userInput' | 'consent' | 'submitting' | 'done'

type FeedbackProps = {
  abortSignal: AbortSignal
  messages: Message[]
  initialDescription?: string
  onDone(result: string, options?: { display?: CommandResultDisplay }): void
  backgroundTasks?: {
    [taskId: string]: {
      type: string
      identity?: { agentId: string }
      messages?: Message[]
    }
  }
}

export function Feedback(props: FeedbackProps): JSX.Element {
  const [step, setStep] = createSignal<Step>('userInput')
  const [cursorOffset, setCursorOffset] = createSignal(0)
  const [description, setDescription] = createSignal(props.initialDescription ?? '')
  const [feedbackId, setFeedbackId] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [envInfo, setEnvInfo] = createSignal<{
    isGit: boolean
    gitState: GitRepoState | null
  }>({
    isGit: false,
    gitState: null,
  })
  const [title, setTitle] = createSignal<string | null>(null)

  return (
    <box flexDirection="column">
      <text>
        <b>Submit Feedback / Bug Report</b>
      </text>

      {/* Step: userInput */}
      <Show when={step() === 'userInput'}>
        <box flexDirection="column" gap={1}>
          <text>Describe the issue below:</text>
          <text>{description() || '(type your description)'}</text>
          <Show when={error()}>
            <box flexDirection="column" gap={1}>
              <text fg="red">{error()}</text>
              <text dimmed>Edit and press Enter to retry, or Esc to cancel</text>
            </box>
          </Show>
        </box>
      </Show>

      {/* Step: consent */}
      <Show when={step() === 'consent'}>
        <box flexDirection="column">
          <text>This report will include:</text>
          <box marginLeft={2} flexDirection="column">
            <text>
              - Your feedback / bug description: <text dimmed>{description()}</text>
            </text>
            <text>
              - Environment info:{' '}
              <text dimmed>
                {env.platform}, {env.terminal}, v{MACRO.VERSION}
              </text>
            </text>
            <Show when={envInfo().gitState}>
              <text>
                - Git repo metadata:{' '}
                <text dimmed>
                  {envInfo().gitState!.branchName}
                  {envInfo().gitState!.commitHash
                    ? `, ${envInfo().gitState!.commitHash.slice(0, 7)}`
                    : ''}
                  {envInfo().gitState!.remoteUrl ? ` @ ${envInfo().gitState!.remoteUrl}` : ''}
                </text>
              </text>
            </Show>
            <text>- Current session transcript</text>
          </box>
          <box marginTop={1}>
            <text>
              Press <b>Enter</b> to confirm and submit.
            </text>
          </box>
        </box>
      </Show>

      {/* Step: submitting */}
      <Show when={step() === 'submitting'}>
        <box flexDirection="row" gap={1}>
          <text>Submitting report\u2026</text>
        </box>
      </Show>

      {/* Step: done */}
      <Show when={step() === 'done'}>
        <box flexDirection="column">
          <Show when={error()}>
            <text fg="red">{error()}</text>
          </Show>
          <Show when={!error()}>
            <text fg="green">Thank you for your report!</text>
          </Show>
          <Show when={feedbackId()}>
            <text dimmed>Feedback ID: {feedbackId()}</text>
          </Show>
          <box marginTop={1}>
            <text>
              Press <b>Enter </b>
              to open your browser and draft a GitHub issue, or any other key to close.
            </text>
          </box>
        </box>
      </Show>

      {/* Footer guide */}
      <Show when={step() === 'userInput'}>
        <text dimmed>Enter to continue · Esc to cancel</text>
      </Show>
      <Show when={step() === 'consent'}>
        <text dimmed>Enter to submit · Esc to cancel</text>
      </Show>
    </box>
  )
}
