/**
 * BridgeDialog — SolidJS port of src/components/BridgeDialog.tsx
 *
 * Shows remote control / bridge status dialog with QR code toggle,
 * disconnect option, and connection status display.
 */
import { basename } from 'path'
import { toString as qrToString } from 'qrcode'
import { createSignal, createEffect, onMount, Show, For, type JSX } from 'solid-js'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import {
  buildActiveFooterText,
  buildIdleFooterText,
  FAILED_FOOTER_TEXT,
  getBridgeStatus,
} from '../../../bridge/bridgeStatusUtil.js'
import { BRIDGE_FAILED_INDICATOR, BRIDGE_READY_INDICATOR } from '../../../constants/figures.js'

type BridgeDialogProps = {
  onDone: () => void
  // These would come from an app-state store in the real SolidJS app:
  connected: boolean
  sessionActive: boolean
  reconnecting: boolean
  connectUrl: string | undefined
  sessionUrl: string | undefined
  error: string | undefined
  explicit: boolean
  environmentId: string | undefined
  sessionId: string | undefined
  verbose: boolean
  setAppState: (updater: (prev: any) => any) => void
}

export function BridgeDialog(props: BridgeDialogProps): JSX.Element {
  const repoName = basename(getOriginalCwd())

  const [showQR, setShowQR] = createSignal(false)
  const [qrText, setQrText] = createSignal('')
  const [branchName, setBranchName] = createSignal('')

  // Load branch name on mount
  onMount(() => {
    import('../../../utils/git.js').then(({ getBranch }) => {
      getBranch().then(setBranchName).catch(() => {})
    })
  })

  // Derive display URL
  const displayUrl = () => (props.sessionActive ? props.sessionUrl : props.connectUrl)

  // Generate QR text when showQR or displayUrl changes
  createEffect(() => {
    const url = displayUrl()
    if (!showQR() || !url) {
      setQrText('')
      return
    }
    qrToString(url, {
      type: 'utf8',
      errorCorrectionLevel: 'L',
      small: true,
    })
      .then(setQrText)
      .catch(() => setQrText(''))
  })

  const { label: statusLabel, color: statusColor } = getBridgeStatus({
    error: props.error,
    connected: props.connected,
    sessionActive: props.sessionActive,
    reconnecting: props.reconnecting,
  })

  const indicator = () => (props.error ? BRIDGE_FAILED_INDICATOR : BRIDGE_READY_INDICATOR)

  const contextParts = () => {
    const parts: string[] = []
    if (repoName) parts.push(repoName)
    if (branchName()) parts.push(branchName())
    return parts
  }

  const contextSuffix = () => {
    const parts = contextParts()
    return parts.length > 0 ? ' \u00B7 ' + parts.join(' \u00B7 ') : ''
  }

  const footerText = () => {
    const url = displayUrl()
    if (props.error) return FAILED_FOOTER_TEXT
    if (!url) return undefined
    return props.sessionActive ? buildActiveFooterText(url) : buildIdleFooterText(url)
  }

  const qrLines = () => {
    const text = qrText()
    return text ? text.split('\n').filter((l: string) => l.length > 0) : []
  }

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <text>
          <text fg={statusColor}>
            {indicator()} {statusLabel}
          </text>
          <text dimmed>{contextSuffix()}</text>
        </text>
        <Show when={props.error}>
          <text fg="red">{props.error}</text>
        </Show>
        <Show when={props.verbose && props.environmentId}>
          <text dimmed>Environment: {props.environmentId}</text>
        </Show>
        <Show when={props.verbose && props.sessionId}>
          <text dimmed>Session: {props.sessionId}</text>
        </Show>
      </box>
      <Show when={showQR() && qrLines().length > 0}>
        <box flexDirection="column">
          <For each={qrLines()}>{(line) => <text>{line}</text>}</For>
        </box>
      </Show>
      <Show when={footerText()}>
        <text dimmed>{footerText()}</text>
      </Show>
      <text dimmed>d to disconnect · space for QR code · Enter/Esc to close</text>
    </box>
  )
}
