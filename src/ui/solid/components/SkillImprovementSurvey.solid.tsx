import { createEffect, Show, For, type JSXElement } from 'solid-js'
import { BLACK_CIRCLE, BULLET_OPERATOR } from '../../../constants/figures.js'
import type { SkillUpdate } from '../../../utils/hooks/skillImprovement.js'
import { normalizeFullWidthDigits } from '../../../utils/stringUtils.js'
import { isValidResponseInput } from '../../solid/components/FeedbackSurvey/FeedbackSurveyView.js'
import type { FeedbackSurveyResponse } from '../../solid/components/FeedbackSurvey/utils.js'

type Props = {
  isOpen: boolean
  skillName: string
  updates: SkillUpdate[]
  handleSelect: (selected: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
}

export function SkillImprovementSurvey(props: Props): JSXElement {
  return (
    <Show when={props.isOpen && !(props.inputValue && !isValidResponseInput(props.inputValue))}>
      <SkillImprovementSurveyView
        skillName={props.skillName}
        updates={props.updates}
        onSelect={props.handleSelect}
        inputValue={props.inputValue}
        setInputValue={props.setInputValue}
      />
    </Show>
  )
}

type ViewProps = {
  skillName: string
  updates: SkillUpdate[]
  onSelect: (option: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
}

const VALID_INPUTS = ['0', '1'] as const

function isValidInput(input: string): boolean {
  return (VALID_INPUTS as readonly string[]).includes(input)
}

function SkillImprovementSurveyView(props: ViewProps): JSXElement {
  let initialInputValue = props.inputValue

  createEffect(() => {
    if (props.inputValue !== initialInputValue) {
      const lastChar = normalizeFullWidthDigits(props.inputValue.slice(-1))
      if (isValidInput(lastChar)) {
        props.setInputValue(props.inputValue.slice(0, -1))
        props.onSelect(lastChar === '1' ? 'good' : 'dismissed')
      }
    }
  })

  return (
    <box flexDirection="column" marginTop={1}>
      <box>
        <text fg="ansi:cyan">{BLACK_CIRCLE} </text>
        <text>
          <b>Skill improvement suggested for &quot;{props.skillName}&quot;</b>
        </text>
      </box>

      <box flexDirection="column" marginLeft={2}>
        <For each={props.updates}>
          {(u) => (
            <text dimmed>
              {BULLET_OPERATOR} {u.change}
            </text>
          )}
        </For>
      </box>

      <box marginLeft={2} marginTop={1}>
        <box width={12}>
          <text>
            <text fg="ansi:cyan">1</text>: Apply
          </text>
        </box>
        <box width={14}>
          <text>
            <text fg="ansi:cyan">0</text>: Dismiss
          </text>
        </box>
      </box>
    </box>
  )
}
