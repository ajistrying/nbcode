import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { BashTool } from '../../../../tools/BashTool/BashTool.js'
import type { PermissionRuleValue } from '../../../../utils/permissions/PermissionRule.js'

type RuleSubtitleProps = {
  ruleValue: PermissionRuleValue
}

export function PermissionRuleDescription(props: RuleSubtitleProps): JSX.Element {
  switch (props.ruleValue.toolName) {
    case BashTool.name: {
      if (props.ruleValue.ruleContent) {
        if (props.ruleValue.ruleContent.endsWith(':*')) {
          return (
            <text dimmed>
              Any Bash command starting with{' '}
              <text><b>{props.ruleValue.ruleContent.slice(0, -2)}</b></text>
            </text>
          )
        } else {
          return (
            <text dimmed>
              The Bash command <text><b>{props.ruleValue.ruleContent}</b></text>
            </text>
          )
        }
      } else {
        return <text dimmed>Any Bash command</text>
      }
    }
    default: {
      if (!props.ruleValue.ruleContent) {
        return (
          <text dimmed>
            Any use of the <text><b>{props.ruleValue.toolName}</b></text> tool
          </text>
        )
      } else {
        return null as unknown as JSX.Element
      }
    }
  }
}
