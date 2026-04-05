import { createSignal, onMount, Show, For, type JSXElement } from 'solid-js'
import figures from 'figures'
import { logForDebugging } from '../../../utils/debug.js'
import type { GitFileStatus } from '../../../utils/git.js'
import { getFileStatus, stashToCleanState } from '../../../utils/git.js'
import { Select } from '../../solid/components/CustomSelect/index.js'
import { Dialog } from '../../solid/design-system/Dialog.js'
import { Spinner } from '../../solid/Spinner.solid.js'

type TeleportStashProps = {
  onStashAndContinue: () => void
  onCancel: () => void
}

export function TeleportStash(props: TeleportStashProps): JSXElement {
  const [gitFileStatus, setGitFileStatus] = createSignal<GitFileStatus | null>(
    null,
  )
  const [loading, setLoading] = createSignal(true)
  const [stashing, setStashing] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const changedFiles = () => {
    const status = gitFileStatus()
    return status !== null
      ? [...status.tracked, ...status.untracked]
      : []
  }

  onMount(async () => {
    try {
      const fileStatus = await getFileStatus()
      setGitFileStatus(fileStatus)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logForDebugging(`Error getting changed files: ${errorMessage}`, {
        level: 'error',
      })
      setError('Failed to get changed files')
    } finally {
      setLoading(false)
    }
  })

  const handleStash = async () => {
    setStashing(true)
    try {
      logForDebugging('Stashing changes before teleport...')
      const success = await stashToCleanState('Teleport auto-stash')

      if (success) {
        logForDebugging('Successfully stashed changes')
        props.onStashAndContinue()
      } else {
        setError('Failed to stash changes')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logForDebugging(`Error stashing changes: ${errorMessage}`, {
        level: 'error',
      })
      setError('Failed to stash changes')
    } finally {
      setStashing(false)
    }
  }

  const handleSelectChange = (value: string) => {
    if (value === 'stash') {
      void handleStash()
    } else {
      props.onCancel()
    }
  }

  return (
    <Dialog title="Uncommitted Changes" onCancel={props.onCancel}>
      <Show when={error()}>
        <text fg="error">{error()}</text>
      </Show>
      <Show
        when={!loading()}
        fallback={
          <box>
            <Spinner />
            <text> Loading changed files…</text>
          </box>
        }
      >
        <Show
          when={!stashing()}
          fallback={
            <box>
              <Spinner />
              <text> Stashing changes…</text>
            </box>
          }
        >
          <box flexDirection="column">
            <text>
              Teleport requires a clean git state. The following files have
              changes:
            </text>
            <box flexDirection="column" paddingLeft={2} marginTop={1}>
              <For each={changedFiles().slice(0, 10)}>
                {(file) => (
                  <text dimmed>
                    {figures.bullet} {file}
                  </text>
                )}
              </For>
              <Show when={changedFiles().length > 10}>
                <text dimmed>
                  … and {changedFiles().length - 10} more
                </text>
              </Show>
            </box>
          </box>
          <Select
            options={[
              { label: 'Stash changes and continue', value: 'stash' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onChange={handleSelectChange}
          />
        </Show>
      </Show>
    </Dialog>
  )
}
