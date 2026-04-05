import { createSignal, createEffect, onMount, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import type { CommandResultDisplay } from '../../../commands.js'
import { openBrowser } from '../../../utils/browser.js'
import {
  getDesktopInstallStatus,
  openCurrentSessionInDesktop,
} from '../../../utils/desktopDeepLink.js'
import { errorMessage } from '../../../utils/errors.js'
import { gracefulShutdown } from '../../../utils/gracefulShutdown.js'
import { flushSessionStorage } from '../../../utils/sessionStorage.js'
import { LoadingState } from '../design-system/LoadingState.solid.js'

const DESKTOP_DOCS_URL = 'https://clau.de/desktop'

export function getDownloadUrl(): string {
  switch (process.platform) {
    case 'win32':
      return 'https://claude.ai/api/desktop/win32/x64/exe/latest/redirect'
    default:
      return 'https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect'
  }
}

type DesktopHandoffState =
  | 'checking'
  | 'prompt-download'
  | 'flushing'
  | 'opening'
  | 'success'
  | 'error'

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function DesktopHandoff(props: Props): JSX.Element {
  const [state, setState] = createSignal<DesktopHandoffState>('checking')
  const [error, setError] = createSignal<string | null>(null)
  const [downloadMessage, setDownloadMessage] = createSignal<string>('')

  // Handle keyboard input for error and prompt-download states
  // In SolidJS, we use onKeyDown on a focused box instead of useInput
  const handleInput = (input: string) => {
    if (state() === 'error') {
      props.onDone(error() ?? 'Unknown error', { display: 'system' })
      return
    }
    if (state() === 'prompt-download') {
      if (input === 'y' || input === 'Y') {
        openBrowser(getDownloadUrl()).catch(() => {})
        props.onDone(
          `Starting download. Re-run /desktop once you\u2019ve installed the app.\nLearn more at ${DESKTOP_DOCS_URL}`,
          { display: 'system' },
        )
      } else if (input === 'n' || input === 'N') {
        props.onDone(
          `The desktop app is required for /desktop. Learn more at ${DESKTOP_DOCS_URL}`,
          { display: 'system' },
        )
      }
    }
  }

  onMount(() => {
    async function performHandoff(): Promise<void> {
      setState('checking')
      const installStatus = await getDesktopInstallStatus()

      if (installStatus.status === 'not-installed') {
        setDownloadMessage('Claude Desktop is not installed.')
        setState('prompt-download')
        return
      }

      if (installStatus.status === 'version-too-old') {
        setDownloadMessage(
          `Claude Desktop needs to be updated (found v${installStatus.version}, need v1.1.2396+).`,
        )
        setState('prompt-download')
        return
      }

      setState('flushing')
      await flushSessionStorage()

      setState('opening')
      const result = await openCurrentSessionInDesktop()

      if (!result.success) {
        setError(result.error ?? 'Failed to open Claude Desktop')
        setState('error')
        return
      }

      setState('success')

      setTimeout(
        async (onDone: Props['onDone']) => {
          onDone('Session transferred to Claude Desktop', { display: 'system' })
          await gracefulShutdown(0, 'other')
        },
        500,
        props.onDone,
      )
    }

    performHandoff().catch(err => {
      setError(errorMessage(err))
      setState('error')
    })
  })

  const messages: Record<
    Exclude<DesktopHandoffState, 'error' | 'prompt-download'>,
    string
  > = {
    checking: 'Checking for Claude Desktop…',
    flushing: 'Saving session…',
    opening: 'Opening Claude Desktop…',
    success: 'Opening in Claude Desktop…',
  }

  return (
    <>
      <Show when={state() === 'error'}>
        <box flexDirection="column" paddingX={2}>
          <text fg="error">Error: {error()}</text>
          <text dimmed>Press any key to continue…</text>
        </box>
      </Show>
      <Show when={state() === 'prompt-download'}>
        <box flexDirection="column" paddingX={2}>
          <text>{downloadMessage()}</text>
          <text>Download now? (y/n)</text>
        </box>
      </Show>
      <Show when={state() !== 'error' && state() !== 'prompt-download'}>
        <LoadingState message={messages[state() as Exclude<DesktopHandoffState, 'error' | 'prompt-download'>]} />
      </Show>
    </>
  )
}
