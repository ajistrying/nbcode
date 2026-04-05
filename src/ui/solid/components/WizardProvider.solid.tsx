import {
  createSignal,
  createMemo,
  createEffect,
  createContext,
  useContext,
  type JSX,
} from 'solid-js'
import { Show } from 'solid-js/web'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import type { WizardContextValue, WizardProviderProps } from '../../components/wizard/types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WizardContext = createContext<WizardContextValue<any> | null>(null)

export function WizardProvider<T extends Record<string, unknown>>(
  props: WizardProviderProps<T> & { children?: JSX.Element },
): JSX.Element {
  const showStepCounter = props.showStepCounter ?? true

  const [currentStepIndex, setCurrentStepIndex] = createSignal(0)
  const [wizardData, setWizardData] = createSignal<T>(props.initialData ?? ({} as T))
  const [isCompleted, setIsCompleted] = createSignal(false)
  const [navigationHistory, setNavigationHistory] = createSignal<number[]>([])

  useExitOnCtrlCDWithKeybindings()

  // Handle completion in effect to avoid updating parent during render
  createEffect(() => {
    if (isCompleted()) {
      setNavigationHistory([])
      void props.onComplete(wizardData())
    }
  })

  const goNext = () => {
    if (currentStepIndex() < props.steps.length - 1) {
      if (navigationHistory().length > 0) {
        setNavigationHistory(prev => [...prev, currentStepIndex()])
      }
      setCurrentStepIndex(prev => prev + 1)
    } else {
      setIsCompleted(true)
    }
  }

  const goBack = () => {
    if (navigationHistory().length > 0) {
      const previousStep = navigationHistory()[navigationHistory().length - 1]
      if (previousStep !== undefined) {
        setNavigationHistory(prev => prev.slice(0, -1))
        setCurrentStepIndex(previousStep)
      }
    } else if (currentStepIndex() > 0) {
      setCurrentStepIndex(prev => prev - 1)
    } else if (props.onCancel) {
      props.onCancel()
    }
  }

  const goToStep = (index: number) => {
    if (index >= 0 && index < props.steps.length) {
      setNavigationHistory(prev => [...prev, currentStepIndex()])
      setCurrentStepIndex(index)
    }
  }

  const cancel = () => {
    setNavigationHistory([])
    if (props.onCancel) {
      props.onCancel()
    }
  }

  const updateWizardData = (updates: Partial<T>) => {
    setWizardData(prev => ({ ...prev, ...updates }))
  }

  const contextValue = createMemo<WizardContextValue<T>>(() => ({
    currentStepIndex: currentStepIndex(),
    totalSteps: props.steps.length,
    wizardData: wizardData(),
    setWizardData,
    updateWizardData,
    goNext,
    goBack,
    goToStep,
    cancel,
    title: props.title,
    showStepCounter,
  }))

  const CurrentStepComponent = () => props.steps[currentStepIndex()]

  return (
    <Show when={CurrentStepComponent() && !isCompleted()}>
      <WizardContext.Provider value={contextValue()}>
        <Show when={props.children} fallback={
          (() => {
            const Comp = CurrentStepComponent()!
            return <Comp />
          })()
        }>
          {props.children}
        </Show>
      </WizardContext.Provider>
    </Show>
  )
}
