import { onMount } from 'solid-js'
import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { logEvent } from 'src/services/analytics/index.js'
import type { ExternalClaudeMdInclude } from '../../../utils/claudemd.js'
import { saveCurrentProjectConfig } from '../../../utils/config.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'

type Props = {
  onDone(): void
  isStandaloneDialog?: boolean
  externalIncludes?: ExternalClaudeMdInclude[]
}

export function ClaudeMdExternalIncludesDialog(props: Props): JSX.Element {
  onMount(() => {
    logEvent('tengu_claude_md_includes_dialog_shown', {})
  })

  const handleSelection = (value: 'yes' | 'no') => {
    if (value === 'no') {
      logEvent('tengu_claude_md_external_includes_dialog_declined', {})
      saveCurrentProjectConfig(current => ({
        ...current,
        hasClaudeMdExternalIncludesApproved: false,
        hasClaudeMdExternalIncludesWarningShown: true,
      }))
    } else {
      logEvent('tengu_claude_md_external_includes_dialog_accepted', {})
      saveCurrentProjectConfig(current => ({
        ...current,
        hasClaudeMdExternalIncludesApproved: true,
        hasClaudeMdExternalIncludesWarningShown: true,
      }))
    }
    props.onDone()
  }

  const handleEscape = () => {
    handleSelection('no')
  }

  return (
    <Dialog
      title="Allow external CLAUDE.md file imports?"
      color="warning"
      onCancel={handleEscape}
      hideBorder={!props.isStandaloneDialog}
      hideInputGuide={!props.isStandaloneDialog}
    >
      <text>
        This project's CLAUDE.md imports files outside the current working
        directory. Never allow this for third-party repositories.
      </text>

      <Show when={props.externalIncludes && props.externalIncludes.length > 0}>
        <box flexDirection="column">
          <text dimmed>External imports:</text>
          <For each={props.externalIncludes}>
            {(include, i) => (
              <text dimmed>{'  '}{include.path}</text>
            )}
          </For>
        </box>
      </Show>

      <text dimmed>
        Important: Only use Claude Code with files you trust. Accessing
        untrusted files may pose security risks{' '}
        https://code.claude.com/docs/en/security{' '}
      </text>

      <Select
        options={[
          { label: 'Yes, allow external imports', value: 'yes' },
          { label: 'No, disable external imports', value: 'no' },
        ]}
        onChange={(value: string) => handleSelection(value as 'yes' | 'no')}
      />
    </Dialog>
  )
}
