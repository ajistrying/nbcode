import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import figures from 'figures'
import type { Question } from '../../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import type { PermissionDecision } from '../../../../utils/permissions/PermissionResult.js'
import { Select } from '../../../CustomSelect/index.js'
import { Divider } from '../../../design-system/Divider.js'
import { PermissionRequestTitle } from '../PermissionRequestTitle.solid.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.solid.js'
import { QuestionNavigationBar } from './QuestionNavigationBar.js'

type Props = {
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string>
  allQuestionsAnswered: boolean
  permissionResult: PermissionDecision
  minContentHeight?: number
  onFinalResponse: (value: 'submit' | 'cancel') => void
}

export function SubmitQuestionsView(props: Props): JSX.Element {
  const answeredQuestions = () =>
    props.questions.filter(
      (q: Question) => q?.question && props.answers[q.question],
    )

  const hasAnswers = () => Object.keys(props.answers).length > 0

  const options = [
    { type: 'text' as const, label: 'Submit answers', value: 'submit' },
    { type: 'text' as const, label: 'Cancel', value: 'cancel' },
  ]

  return (
    <box flexDirection="column" marginTop={1}>
      <Divider color="inactive" />
      <box
        flexDirection="column"
        borderTop={true}
        borderColor="inactive"
        paddingTop={0}
      >
        <QuestionNavigationBar
          questions={props.questions}
          currentQuestionIndex={props.currentQuestionIndex}
          answers={props.answers}
        />
        <PermissionRequestTitle title="Review your answers" color="text" />
        <box
          flexDirection="column"
          marginTop={1}
          minHeight={props.minContentHeight}
        >
          <Show when={!props.allQuestionsAnswered}>
            <box marginBottom={1}>
              <text fg="warning">
                {figures.warning} You have not answered all questions
              </text>
            </box>
          </Show>
          <Show when={hasAnswers()}>
            <box flexDirection="column" marginBottom={1}>
              <For each={answeredQuestions()}>
                {(q: Question) => {
                  const answer = props.answers[q?.question]
                  return (
                    <box flexDirection="column" marginLeft={1}>
                      <text>
                        {figures.bullet} {q?.question || 'Question'}
                      </text>
                      <box marginLeft={2}>
                        <text fg="success">
                          {figures.arrowRight} {answer}
                        </text>
                      </box>
                    </box>
                  )
                }}
              </For>
            </box>
          </Show>

          <PermissionRuleExplanation
            permissionResult={props.permissionResult}
            toolType="tool"
          />
          <text fg="inactive">Ready to submit your answers?</text>
          <box marginTop={1}>
            <Select
              options={options}
              onChange={(value: string) =>
                props.onFinalResponse(value as 'submit' | 'cancel')
              }
              onCancel={() => props.onFinalResponse('cancel')}
            />
          </box>
        </box>
      </box>
    </box>
  )
}
