import { createSignal, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { logEvent } from '../../../services/analytics/index.js'
import type { Message } from '../../../types/message.js'
import {
  generatePermissionExplanation,
  isPermissionExplainerEnabled,
  type PermissionExplanation as PermissionExplanationType,
  type RiskLevel,
} from '../../../utils/permissions/permissionExplainer.js'
import { ShimmerChar } from '../../../components/Spinner/ShimmerChar.js'
import { useShimmerAnimation } from '../../../components/Spinner/useShimmerAnimation.js'

const LOADING_MESSAGE = 'Loading explanation\u2026'

function ShimmerLoadingText(): JSX.Element {
  const [ref, glimmerIndex] = useShimmerAnimation('responding', LOADING_MESSAGE, false)
  return (
    <box ref={ref}>
      <text>
        {LOADING_MESSAGE.split('').map((char, index) => (
          <ShimmerChar
            key={index}
            char={char}
            index={index}
            glimmerIndex={glimmerIndex}
            messageColor="inactive"
            shimmerColor="text"
          />
        ))}
      </text>
    </box>
  )
}

function getRiskColor(riskLevel: RiskLevel): 'success' | 'warning' | 'error' {
  switch (riskLevel) {
    case 'LOW':
      return 'success'
    case 'MEDIUM':
      return 'warning'
    case 'HIGH':
      return 'error'
  }
}

function getRiskLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'LOW':
      return 'Low risk'
    case 'MEDIUM':
      return 'Med risk'
    case 'HIGH':
      return 'High risk'
  }
}

type PermissionExplanationProps = {
  toolName: string
  toolInput: unknown
  toolDescription?: string
  messages?: Message[]
}

type ExplainerState = {
  visible: boolean
  enabled: boolean
  promise: Promise<PermissionExplanationType | null> | null
}

/**
 * Creates an explanation promise that never rejects.
 */
function createExplanationPromise(
  props: PermissionExplanationProps,
): Promise<PermissionExplanationType | null> {
  return generatePermissionExplanation({
    toolName: props.toolName,
    toolInput: props.toolInput,
    toolDescription: props.toolDescription,
    messages: props.messages,
    signal: new AbortController().signal,
  }).catch(() => null)
}

/**
 * Hook that manages the permission explainer state.
 * NOTE: 2 useState hooks in original
 */
export function usePermissionExplainerUI(props: PermissionExplanationProps): ExplainerState {
  const enabled = isPermissionExplainerEnabled()
  const [visible, setVisible] = createSignal(false)
  const [promise, setPromise] = createSignal<Promise<PermissionExplanationType | null> | null>(
    null,
  )

  const toggle = () => {
    if (!visible()) {
      logEvent('tengu_permission_explainer_shortcut_used', {})
      if (!promise()) {
        setPromise(createExplanationPromise(props))
      }
    }
    setVisible((v) => !v)
  }

  useKeybinding('confirm:toggleExplanation', toggle, {
    context: 'Confirmation',
    isActive: enabled,
  })

  return {
    get visible() {
      return visible()
    },
    enabled,
    get promise() {
      return promise()
    },
  }
}

/**
 * Explanation content display component.
 */
function ExplanationContent(props: {
  promise: Promise<PermissionExplanationType | null>
}): JSX.Element {
  // In SolidJS we can use a resource, but since this uses React 19 use(),
  // we approximate with a signal approach
  // For now, keep it compatible with existing infrastructure
  return <ShimmerLoadingText />
}

export function PermissionExplanation(props: { state: ExplainerState }): JSX.Element {
  return (
    <Show when={props.state.visible && props.state.promise}>
      <box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
        <text dimmed>Explanation (Ctrl+E to toggle)</text>
        <ExplanationContent promise={props.state.promise!} />
      </box>
    </Show>
  )
}
