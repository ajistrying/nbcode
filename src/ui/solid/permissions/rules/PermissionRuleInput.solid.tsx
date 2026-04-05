import { createSignal } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import TextInput from '../../../../components/TextInput.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../../../hooks/useTerminalSize.js'
import { useKeybinding } from '../../../../keybindings/useKeybinding.js'
import { BashTool } from '../../../../tools/BashTool/BashTool.js'
import { WebFetchTool } from '../../../../tools/WebFetchTool/WebFetchTool.js'
import type {
  PermissionBehavior,
  PermissionRuleValue,
} from '../../../../utils/permissions/PermissionRule.js'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../../../../utils/permissions/permissionRuleParser.js'

export type PermissionRuleInputProps = {
  onCancel: () => void
  onSubmit: (ruleValue: PermissionRuleValue, ruleBehavior: PermissionBehavior) => void
  ruleBehavior: PermissionBehavior
}

export function PermissionRuleInput(props: PermissionRuleInputProps): JSX.Element {
  const [inputValue, setInputValue] = createSignal('')
  const [cursorOffset, setCursorOffset] = createSignal(0)
  const exitState = useExitOnCtrlCDWithKeybindings()

  useKeybinding('confirm:no', props.onCancel, { context: 'Settings' })

  const { columns } = useTerminalSize()
  const textInputColumns = () => columns - 6

  function handleSubmit(value: string) {
    const trimmedValue = value.trim()
    if (trimmedValue.length === 0) return
    const ruleValue = permissionRuleValueFromString(trimmedValue)
    props.onSubmit(ruleValue, props.ruleBehavior)
  }

  return (
    <>
      <box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        paddingLeft={1}
        paddingRight={1}
        borderColor="permission"
      >
        <text>
          <b fg="permission">Add {props.ruleBehavior} permission rule</b>
        </text>
        <box flexDirection="column">
          <text>
            Permission rules are a tool name, optionally followed by a specifier in
            parentheses.
            {'\n'}e.g.,{' '}
            <text><b>{permissionRuleValueToString({ toolName: WebFetchTool.name })}</b></text>
            {' or '}
            <text>
              <b>
                {permissionRuleValueToString({
                  toolName: BashTool.name,
                  ruleContent: 'ls:*',
                })}
              </b>
            </text>
          </text>
          <box borderDimColor borderStyle="round" marginY={1} paddingLeft={1}>
            <TextInput
              showCursor
              value={inputValue()}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder={`Enter permission rule${figures.ellipsis}`}
              columns={textInputColumns()}
              cursorOffset={cursorOffset()}
              onChangeCursorOffset={setCursorOffset}
            />
          </box>
        </box>
      </box>
      <box marginLeft={3}>
        {exitState.pending ? (
          <text dimmed>Press {exitState.keyName} again to exit</text>
        ) : (
          <text dimmed>Enter to submit \u00b7 Esc to cancel</text>
        )}
      </box>
    </>
  )
}
