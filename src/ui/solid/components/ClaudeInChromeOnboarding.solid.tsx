import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import { logEvent } from '../../../services/analytics/index.js'
import { useInput } from '../../../ink.js'
import { isChromeExtensionInstalled } from '../../../utils/claudeInChrome/setup.js'
import { saveGlobalConfig } from '../../../utils/config.js'
import { Dialog } from '../../components/design-system/Dialog.js'

const CHROME_EXTENSION_URL = 'https://claude.ai/chrome'
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions'

type Props = {
  onDone: () => void
}

export function ClaudeInChromeOnboarding(props: Props): JSX.Element {
  const [isExtensionInstalled, setIsExtensionInstalled] = createSignal(false)

  onMount(() => {
    logEvent('tengu_claude_in_chrome_onboarding_shown', {})
    void isChromeExtensionInstalled().then(setIsExtensionInstalled)
    saveGlobalConfig(current => {
      return { ...current, hasCompletedClaudeInChromeOnboarding: true }
    })
  })

  useInput((_input: string, key: any) => {
    if (key.return) {
      props.onDone()
    }
  })

  return (
    <Dialog
      title="Claude in Chrome (Beta)"
      onCancel={props.onDone}
      color="chromeYellow"
    >
      <box flexDirection="column" gap={1}>
        <text>
          Claude in Chrome works with the Chrome extension to let you control
          your browser directly from Claude Code. You can navigate websites,
          fill forms, capture screenshots, record GIFs, and debug with console
          logs and network requests.
          <Show when={!isExtensionInstalled()}>
            {'\n\n'}
            Requires the Chrome extension. Get started at {CHROME_EXTENSION_URL}
          </Show>
        </text>

        <text dimmed>
          Site-level permissions are inherited from the Chrome extension. Manage
          permissions in the Chrome extension settings to control which sites
          Claude can browse, click, and type on
          <Show when={isExtensionInstalled()}>
            {' '}({CHROME_PERMISSIONS_URL})
          </Show>
          .
        </text>
        <text dimmed>
          For more info, use{' '}
          <text><b fg="chromeYellow">/chrome</b></text>{' '}
          or visit https://code.claude.com/docs/en/chrome
        </text>
      </box>
    </Dialog>
  )
}
