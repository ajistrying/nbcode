import type { JSX } from '@opentui/solid'

export function InterruptedByUser(): JSX.Element {
  return (
    <>
      <text dimmed>Interrupted </text>
      {"external" === 'ant' ? (
        <text dimmed>· [ANT-ONLY] /issue to report a model issue</text>
      ) : (
        <text dimmed>· What should Claude do instead?</text>
      )}
    </>
  )
}
