import { createSignal, createMemo, Show, For, type JSXElement } from 'solid-js'
import { getDisplayPath } from '../../../utils/file.js'
import {
  removePathFromRepo,
  validateRepoAtPath,
} from '../../../utils/githubRepoPathMapping.js'
import { Select } from '../../solid/components/CustomSelect/index.js'
import { Dialog } from '../../solid/design-system/Dialog.js'
import { Spinner } from '../../solid/Spinner.solid.js'

type Props = {
  targetRepo: string
  initialPaths: string[]
  onSelectPath: (path: string) => void
  onCancel: () => void
}

export function TeleportRepoMismatchDialog(props: Props): JSXElement {
  const [availablePaths, setAvailablePaths] = createSignal<string[]>(
    props.initialPaths,
  )
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
  const [validating, setValidating] = createSignal(false)

  const handleChange = async (value: string): Promise<void> => {
    if (value === 'cancel') {
      props.onCancel()
      return
    }

    setValidating(true)
    setErrorMessage(null)

    const isValid = await validateRepoAtPath(value, props.targetRepo)

    if (isValid) {
      props.onSelectPath(value)
      return
    }

    removePathFromRepo(props.targetRepo, value)
    const updatedPaths = availablePaths().filter((p) => p !== value)
    setAvailablePaths(updatedPaths)
    setValidating(false)

    setErrorMessage(
      `${getDisplayPath(value)} no longer contains the correct repository. Select another path.`,
    )
  }

  const options = createMemo(() => [
    ...availablePaths().map((path) => ({
      label: (
        <text>
          Use{' '}
          <text>
            <b>{getDisplayPath(path)}</b>
          </text>
        </text>
      ),
      value: path,
    })),
    { label: 'Cancel', value: 'cancel' },
  ])

  return (
    <Dialog
      title="Teleport to Repo"
      onCancel={props.onCancel}
      color="background"
    >
      <Show
        when={availablePaths().length > 0}
        fallback={
          <box flexDirection="column" gap={1}>
            <Show when={errorMessage()}>
              <text fg="error">{errorMessage()}</text>
            </Show>
            <text dimmed>
              Run claude --teleport from a checkout of {props.targetRepo}
            </text>
          </box>
        }
      >
        <>
          <box flexDirection="column" gap={1}>
            <Show when={errorMessage()}>
              <text fg="error">{errorMessage()}</text>
            </Show>
            <text>
              Open Claude Code in{' '}
              <text>
                <b>{props.targetRepo}</b>
              </text>
              :
            </text>
          </box>

          <Show
            when={!validating()}
            fallback={
              <box>
                <Spinner />
                <text> Validating repository…</text>
              </box>
            }
          >
            <Select
              options={options()}
              onChange={(value: string) => void handleChange(value)}
            />
          </Show>
        </>
      </Show>
    </Dialog>
  )
}
