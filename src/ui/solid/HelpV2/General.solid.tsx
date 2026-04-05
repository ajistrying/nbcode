/**
 * General help tab content.
 *
 * SolidJS + OpenTUI port of src/components/HelpV2/General.tsx.
 *
 * Note: PromptInputHelpMenu is referenced but not ported here.
 * It would need its own Solid port.
 */

import type { JSX } from '@opentui/solid'

// Placeholder for the PromptInputHelpMenu Solid port.
// Replace with the actual import when available:
// import { PromptInputHelpMenu } from '../../PromptInput/PromptInputHelpMenu.solid.js'

export function General() {
  return (
    <box flexDirection="column" paddingY={1} gap={1}>
      <box>
        <text>
          Claude understands your codebase, makes edits with your permission,
          and executes commands — right from your terminal.
        </text>
      </box>
      <box flexDirection="column">
        <box>
          <text><b>Shortcuts</b></text>
        </box>
        {/* TODO: Port PromptInputHelpMenu to Solid and include here */}
        {/* <PromptInputHelpMenu gap={2} fixedWidth /> */}
      </box>
    </box>
  )
}
