import type { JSX } from '@opentui/solid'
import Link from '../../../ink/components/Link.js'
import type { PrReviewState } from '../../../utils/ghPrStatus.js'

type Props = {
  number: number
  url: string
  reviewState?: PrReviewState
  bold?: boolean
}

function getPrStatusColor(
  state?: PrReviewState,
): 'success' | 'error' | 'warning' | 'merged' | undefined {
  switch (state) {
    case 'approved':
      return 'success'
    case 'changes_requested':
      return 'error'
    case 'pending':
      return 'warning'
    case 'merged':
      return 'merged'
    default:
      return undefined
  }
}

export function PrBadge(props: Props): JSX.Element {
  const statusColor = () => getPrStatusColor(props.reviewState)
  const label = () => (
    <text fg={statusColor()} dimmed={!statusColor() && !props.bold}>
      <b>#{props.number}</b>
    </text>
  )

  return (
    <text>
      <text dimmed={!props.bold}>PR</text>{' '}
      <Link url={props.url} fallback={label()}>
        <text
          fg={statusColor()}
          dimmed={!statusColor() && !props.bold}
        >
          <u>#{props.number}</u>
        </text>
      </Link>
    </text>
  )
}
