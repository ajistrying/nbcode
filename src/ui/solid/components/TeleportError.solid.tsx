import { createSignal, createEffect, Show, type JSXElement } from 'solid-js'
import {
  checkIsGitClean,
  checkNeedsClaudeAiLogin,
} from '../../../utils/background/remote/preconditions.js'
import { gracefulShutdownSync } from '../../../utils/gracefulShutdown.js'
import { ConsoleOAuthFlow } from '../../solid/components/ConsoleOAuthFlow.js'
import { Select } from '../../solid/components/CustomSelect/index.js'
import { Dialog } from '../../solid/design-system/Dialog.js'
import { TeleportStash } from './TeleportStash.solid.js'

export type TeleportLocalErrorType = 'needsLogin' | 'needsGitStash'

type TeleportErrorProps = {
  onComplete: () => void
  errorsToIgnore?: ReadonlySet<TeleportLocalErrorType>
}

const EMPTY_ERRORS_TO_IGNORE: ReadonlySet<TeleportLocalErrorType> = new Set()

export function TeleportError(props: TeleportErrorProps): JSXElement {
  const errorsToIgnore = () => props.errorsToIgnore ?? EMPTY_ERRORS_TO_IGNORE
  const [currentError, setCurrentError] =
    createSignal<TeleportLocalErrorType | null>(null)
  const [isLoggingIn, setIsLoggingIn] = createSignal(false)

  const checkErrors = async () => {
    const currentErrors = await getTeleportErrors()
    const filteredErrors = new Set(
      Array.from(currentErrors).filter(
        (error: TeleportLocalErrorType) => !errorsToIgnore().has(error),
      ),
    )

    if (filteredErrors.size === 0) {
      props.onComplete()
      return
    }

    if (filteredErrors.has('needsLogin')) {
      setCurrentError('needsLogin')
    } else if (filteredErrors.has('needsGitStash')) {
      setCurrentError('needsGitStash')
    }
  }

  createEffect(() => {
    void checkErrors()
  })

  const onCancel = () => {
    gracefulShutdownSync(0)
  }

  const handleLoginComplete = () => {
    setIsLoggingIn(false)
    void checkErrors()
  }

  const handleLoginWithClaudeAI = () => {
    setIsLoggingIn(true)
  }

  const handleLoginDialogSelect = (value: string) => {
    if (value === 'login') {
      handleLoginWithClaudeAI()
    } else {
      onCancel()
    }
  }

  const handleStashComplete = () => {
    void checkErrors()
  }

  return (
    <Show when={currentError()}>
      <Show
        when={currentError() === 'needsGitStash'}
        fallback={
          <Show
            when={!isLoggingIn()}
            fallback={
              <ConsoleOAuthFlow
                onDone={handleLoginComplete}
                mode="login"
                forceLoginMethod="claudeai"
              />
            }
          >
            <Dialog title="Log in to Claude" onCancel={onCancel}>
              <box flexDirection="column">
                <text dimmed>Teleport requires a Claude.ai account.</text>
                <text dimmed>
                  Your Claude Pro/Max subscription will be used by Claude Code.
                </text>
              </box>
              <Select
                options={[
                  { label: 'Login with Claude account', value: 'login' },
                  { label: 'Exit', value: 'exit' },
                ]}
                onChange={handleLoginDialogSelect}
              />
            </Dialog>
          </Show>
        }
      >
        <TeleportStash
          onStashAndContinue={handleStashComplete}
          onCancel={onCancel}
        />
      </Show>
    </Show>
  )
}

export async function getTeleportErrors(): Promise<
  Set<TeleportLocalErrorType>
> {
  const errors = new Set<TeleportLocalErrorType>()

  const [needsLogin, isGitClean] = await Promise.all([
    checkNeedsClaudeAiLogin(),
    checkIsGitClean(),
  ])

  if (needsLogin) {
    errors.add('needsLogin')
  }
  if (!isGitClean) {
    errors.add('needsGitStash')
  }

  return errors
}
