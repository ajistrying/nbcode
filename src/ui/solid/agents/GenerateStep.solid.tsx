import { APIUserAbortError } from '@anthropic-ai/sdk'
import { createSignal, type JSX } from 'solid-js'
import { Show } from 'solid-js/web'
import { onMount } from 'solid-js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { createAbortController } from '../../../utils/abortController.js'
import { editPromptInEditor } from '../../../utils/promptEditor.js'
import { ConfigurableShortcutHint } from '../components/ConfigurableShortcutHint.solid.js'
import { Byline } from '../design-system/Byline.solid.js'
import { Spinner } from '../Spinner/Spinner.solid.js'
import TextInput from '../components/TextInput.solid.js'
import { useWizard } from '../../components/wizard/index.js'
import { WizardDialogLayout } from '../../components/wizard/WizardDialogLayout.js'
import { generateAgent } from '../../components/agents/generateAgent.js'
import type { AgentWizardData } from '../../components/agents/new-agent-creation/types.js'

export function GenerateStep(): JSX.Element {
  const { updateWizardData, goBack, goToStep, wizardData } =
    useWizard<AgentWizardData>()
  const [prompt, setPrompt] = createSignal(wizardData.generationPrompt || '')
  const [isGenerating, setIsGenerating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [cursorOffset, setCursorOffset] = createSignal(prompt().length)
  const model = useMainLoopModel()
  let abortControllerRef: AbortController | null = null

  const handleCancelGeneration = () => {
    if (abortControllerRef) {
      abortControllerRef.abort()
      abortControllerRef = null
      setIsGenerating(false)
      setError('Generation cancelled')
    }
  }

  useKeybinding('confirm:no', handleCancelGeneration, {
    context: 'Settings',
    isActive: isGenerating(),
  })

  const handleExternalEditor = async () => {
    const result = await editPromptInEditor(prompt())
    if (result.content !== null) {
      setPrompt(result.content)
      setCursorOffset(result.content.length)
    }
  }

  useKeybinding('chat:externalEditor', handleExternalEditor, {
    context: 'Chat',
    isActive: !isGenerating(),
  })

  const handleGoBack = () => {
    updateWizardData({
      generationPrompt: '',
      agentType: '',
      systemPrompt: '',
      whenToUse: '',
      generatedAgent: undefined,
      wasGenerated: false,
    })
    setPrompt('')
    setError(null)
    goBack()
  }

  useKeybinding('confirm:no', handleGoBack, {
    context: 'Settings',
    isActive: !isGenerating(),
  })

  const handleGenerate = async (): Promise<void> => {
    const trimmedPrompt = prompt().trim()
    if (!trimmedPrompt) {
      setError('Please describe what the agent should do')
      return
    }

    setError(null)
    setIsGenerating(true)
    updateWizardData({
      generationPrompt: trimmedPrompt,
      isGenerating: true,
    })

    const controller = createAbortController()
    abortControllerRef = controller

    try {
      const generated = await generateAgent(
        trimmedPrompt,
        model,
        [],
        controller.signal,
      )

      updateWizardData({
        agentType: generated.identifier,
        whenToUse: generated.whenToUse,
        systemPrompt: generated.systemPrompt,
        generatedAgent: generated,
        isGenerating: false,
        wasGenerated: true,
      })

      goToStep(6)
    } catch (err) {
      if (err instanceof APIUserAbortError) {
        // User cancelled - no error to show
      } else if (
        err instanceof Error &&
        !err.message.includes('No assistant message found')
      ) {
        setError(err.message || 'Failed to generate agent')
      }
      updateWizardData({ isGenerating: false })
    } finally {
      setIsGenerating(false)
      abortControllerRef = null
    }
  }

  const subtitle =
    'Describe what this agent should do and when it should be used (be comprehensive for best results)'

  return (
    <>
      <Show when={isGenerating()}>
        <WizardDialogLayout
          subtitle={subtitle}
          footerText={
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Settings"
              fallback="Esc"
              description="cancel"
            />
          }
        >
          <box flexDirection="row" alignItems="center">
            <Spinner />
            <text fg="suggestion"> Generating agent from description...</text>
          </box>
        </WizardDialogLayout>
      </Show>
      <Show when={!isGenerating()}>
        <WizardDialogLayout
          subtitle={subtitle}
          footerText={
            <Byline>
              <ConfigurableShortcutHint
                action="confirm:yes"
                context="Confirmation"
                fallback="Enter"
                description="submit"
              />
              <ConfigurableShortcutHint
                action="chat:externalEditor"
                context="Chat"
                fallback="ctrl+g"
                description="open in editor"
              />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Settings"
                fallback="Esc"
                description="go back"
              />
            </Byline>
          }
        >
          <box flexDirection="column">
            <Show when={error()}>
              <box marginBottom={1}>
                <text fg="error">{error()}</text>
              </box>
            </Show>
            <TextInput
              value={prompt()}
              onChange={setPrompt}
              onSubmit={handleGenerate}
              placeholder="e.g., Help me write unit tests for my code..."
              columns={80}
              cursorOffset={cursorOffset()}
              onChangeCursorOffset={setCursorOffset}
              focus
              showCursor
            />
          </box>
        </WizardDialogLayout>
      </Show>
    </>
  )
}
