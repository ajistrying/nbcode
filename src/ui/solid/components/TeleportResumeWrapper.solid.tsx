import { createEffect, Show, type JSXElement } from 'solid-js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import type { TeleportRemoteResponse } from '../../../utils/conversationRecovery.js'
import type { CodeSession } from '../../../utils/teleport/api.js'
import {
  type TeleportSource,
  useTeleportResume,
} from '../../../hooks/useTeleportResume.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { ResumeTask } from '../../solid/components/ResumeTask.js'
import { Spinner } from '../../solid/Spinner.solid.js'

interface TeleportResumeWrapperProps {
  onComplete: (result: TeleportRemoteResponse) => void
  onCancel: () => void
  onError?: (error: string, formattedMessage?: string) => void
  isEmbedded?: boolean
  source: TeleportSource
}

export function TeleportResumeWrapper(
  props: TeleportResumeWrapperProps,
): JSXElement {
  const isEmbedded = () => props.isEmbedded ?? false
  const { resumeSession, isResuming, error, selectedSession } =
    useTeleportResume(props.source)

  createEffect(() => {
    logEvent('tengu_teleport_started', {
      source:
        props.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  })

  const handleSelect = async (session: CodeSession) => {
    const result = await resumeSession(session)
    if (result) {
      props.onComplete(result)
    } else if (error) {
      if (props.onError) {
        props.onError(error.message, error.formattedMessage)
      }
    }
  }

  const handleCancel = () => {
    logEvent('tengu_teleport_cancelled', {})
    props.onCancel()
  }

  useKeybinding('app:interrupt', handleCancel, {
    context: 'Global',
    get isActive() {
      return !!error && !props.onError
    },
  })

  return (
    <Show
      when={!(isResuming && selectedSession)}
      fallback={
        <box flexDirection="column" padding={1}>
          <box flexDirection="row">
            <Spinner />
            <text><b>Resuming session…</b></text>
          </box>
          <text dimmed>Loading &quot;{selectedSession?.title}&quot;…</text>
        </box>
      }
    >
      <Show
        when={!(error && !props.onError)}
        fallback={
          <box flexDirection="column" padding={1}>
            <text bold fg="error">
              Failed to resume session
            </text>
            <text dimmed>{error?.message}</text>
            <box marginTop={1}>
              <text dimmed>
                Press <text><b>Esc</b></text> to cancel
              </text>
            </box>
          </box>
        }
      >
        <ResumeTask
          onSelect={handleSelect}
          onCancel={handleCancel}
          isEmbedded={isEmbedded()}
        />
      </Show>
    </Show>
  )
}
