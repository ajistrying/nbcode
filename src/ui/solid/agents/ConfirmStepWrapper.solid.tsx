import type { JSXElement } from 'solid-js'

type Props = {
  title: string
  description?: string
  onConfirm: () => void
  onCancel: () => void
  onBack: () => void
  children?: JSXElement
}

export function ConfirmStepWrapper(props: Props): JSXElement {
  const handleConfirm = () => {
    props.onConfirm()
  }

  const handleCancel = () => {
    props.onCancel()
  }

  const handleBack = () => {
    props.onBack()
  }

  return (
    <box flexDirection="column" gap={1}>
      <text><b>{props.title}</b></text>
      {props.description && <text dimmed>{props.description}</text>}
      {props.children}
      <box gap={2}>
        <text dimmed>
          Enter to confirm · Esc to cancel · ← to go back
        </text>
      </box>
    </box>
  )
}
