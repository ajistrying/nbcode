/**
 * Joins children with a middot separator (" · ") for inline metadata display.
 *
 * SolidJS + OpenTUI port of src/components/design-system/Byline.tsx.
 *
 * Named after the publishing term "byline" - the line of metadata typically
 * shown below a title (e.g., "John Doe · 5 min read · Mar 12").
 */

import { For, Show, children as resolveChildren } from 'solid-js'
import type { JSX } from '@opentui/solid'

interface BylineProps {
  children: JSX.Element
}

export function Byline(props: BylineProps) {
  const resolved = resolveChildren(() => props.children)

  const validChildren = () => {
    const r = resolved()
    if (Array.isArray(r)) {
      return r.filter((c) => c != null && c !== false && c !== true)
    }
    if (r == null || r === false || r === true) return []
    return [r]
  }

  return (
    <Show when={validChildren().length > 0}>
      <For each={validChildren()}>
        {(child, index) => (
          <>
            <Show when={index() > 0}>
              <text dimmed> · </text>
            </Show>
            {child}
          </>
        )}
      </For>
    </Show>
  )
}
