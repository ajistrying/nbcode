import { onMount, type JSXElement } from 'solid-js'

type Props = {
  agentType: string
  scope: unknown
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

export function SnapshotUpdateDialog(props: Props): JSXElement {
  onMount(() => {
    props.onCancel()
  })

  return null
}
