import { useContext } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { useTerminalViewport } from '../../../ink/hooks/use-terminal-viewport.js'
import { InVirtualListContext } from '../../components/messageActions.js'

type Props = {
  children: JSX.Element
}

/**
 * Freezes children when they scroll above the terminal viewport (into scrollback).
 *
 * In SolidJS, we use a plain variable (let cached) to hold the last-visible
 * children reference. When offscreen, we return the cached element to avoid
 * triggering a diff in the reconciler.
 */
export function OffscreenFreeze(props: Props): JSX.Element {
  const inVirtualList = useContext(InVirtualListContext)
  const [ref, { isVisible }] = useTerminalViewport()
  let cached: JSX.Element = props.children

  // Virtual list has no terminal scrollback, so skip freezing.
  if (isVisible || inVirtualList) {
    cached = props.children
  }

  return <box ref={ref}>{cached}</box>
}
