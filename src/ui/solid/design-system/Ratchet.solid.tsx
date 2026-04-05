import { createSignal, createEffect } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { useTerminalViewport } from '../../../ink/hooks/use-terminal-viewport.js'
import { type DOMElement, measureElement } from '../../../ink.js'

type Props = {
  children: JSX.Element
  lock?: 'always' | 'offscreen'
}

export function Ratchet(props: Props): JSX.Element {
  const lock = () => props.lock ?? 'always'
  const [viewportRef, { isVisible }] = useTerminalViewport()
  const { rows } = useTerminalSize()
  let innerRef: DOMElement | null = null
  let maxHeight = 0
  const [minHeight, setMinHeight] = createSignal(0)

  const outerRef = (el: DOMElement | null) => {
    viewportRef(el)
  }

  const engaged = () => lock() === 'always' || !isVisible

  // useLayoutEffect equivalent
  createEffect(() => {
    if (!innerRef) {
      return
    }
    const { height } = measureElement(innerRef)
    if (height > maxHeight) {
      maxHeight = Math.min(height, rows)
      setMinHeight(maxHeight)
    }
  })

  return (
    <box minHeight={engaged() ? minHeight() : undefined} ref={outerRef}>
      <box ref={(el: DOMElement) => { innerRef = el }} flexDirection="column">
        {props.children}
      </box>
    </box>
  )
}
