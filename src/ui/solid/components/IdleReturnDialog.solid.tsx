import type { JSX } from '@opentui/solid'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  onResume: () => void
  onNewConversation: () => void
  onExit: () => void
  idleDuration: string
}

export function IdleReturnDialog(props: Props): JSX.Element {
  function handleSelect(value: string): void {
    switch (value) {
      case 'resume':
        props.onResume()
        break
      case 'new':
        props.onNewConversation()
        break
      case 'exit':
        props.onExit()
        break
    }
  }

  return (
    <Dialog
      title={`Welcome back! You've been away for ${props.idleDuration}.`}
      onCancel={props.onResume}
    >
      <text>What would you like to do?</text>
      <Select
        options={[
          { label: 'Resume this conversation', value: 'resume' },
          { label: 'Start a new conversation', value: 'new' },
          { label: 'Exit', value: 'exit' },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
