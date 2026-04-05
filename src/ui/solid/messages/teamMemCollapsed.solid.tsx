import type { JSX } from '@opentui/solid'
import type { CollapsedReadSearchGroup } from '../../../types/message.js'

export function checkHasTeamMemOps(message: CollapsedReadSearchGroup): boolean {
  return (
    (message.teamMemorySearchCount ?? 0) > 0 ||
    (message.teamMemoryReadCount ?? 0) > 0 ||
    (message.teamMemoryWriteCount ?? 0) > 0
  )
}

export function TeamMemCountParts(props: {
  message: CollapsedReadSearchGroup
  isActiveGroup: boolean | undefined
  hasPrecedingParts: boolean
}): JSX.Element {
  const tmReadCount = () => props.message.teamMemoryReadCount ?? 0
  const tmSearchCount = () => props.message.teamMemorySearchCount ?? 0
  const tmWriteCount = () => props.message.teamMemoryWriteCount ?? 0

  if (tmReadCount() === 0 && tmSearchCount() === 0 && tmWriteCount() === 0) {
    return null
  }

  const nodes: JSX.Element[] = []
  let count = props.hasPrecedingParts ? 1 : 0

  if (tmReadCount() > 0) {
    const verb = props.isActiveGroup
      ? count === 0 ? 'Recalling' : 'recalling'
      : count === 0 ? 'Recalled' : 'recalled'
    if (count > 0) {
      nodes.push(<text>, </text>)
    }
    nodes.push(
      <text>
        {verb} <text><b>{tmReadCount()}</b></text> team{' '}
        {tmReadCount() === 1 ? 'memory' : 'memories'}
      </text>,
    )
    count++
  }

  if (tmSearchCount() > 0) {
    const verb = props.isActiveGroup
      ? count === 0 ? 'Searching' : 'searching'
      : count === 0 ? 'Searched' : 'searched'
    if (count > 0) {
      nodes.push(<text>, </text>)
    }
    nodes.push(<text>{`${verb} team memories`}</text>)
    count++
  }

  if (tmWriteCount() > 0) {
    const verb = props.isActiveGroup
      ? count === 0 ? 'Writing' : 'writing'
      : count === 0 ? 'Wrote' : 'wrote'
    if (count > 0) {
      nodes.push(<text>, </text>)
    }
    nodes.push(
      <text>
        {verb} <text><b>{tmWriteCount()}</b></text> team{' '}
        {tmWriteCount() === 1 ? 'memory' : 'memories'}
      </text>,
    )
  }

  return <>{nodes}</>
}
