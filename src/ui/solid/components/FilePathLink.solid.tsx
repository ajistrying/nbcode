import type { JSX } from '@opentui/solid'
import { pathToFileURL } from 'url'
import Link from '../../../ink/components/Link.js'

type Props = {
  /** The absolute file path */
  filePath: string
  /** Optional display text (defaults to filePath) */
  children?: JSX.Element
}

/**
 * Renders a file path as an OSC 8 hyperlink.
 * This helps terminals like iTerm correctly identify file paths
 * even when they appear inside parentheses or other text.
 */
export function FilePathLink(props: Props): JSX.Element {
  return (
    <Link url={pathToFileURL(props.filePath).href}>
      {props.children ?? props.filePath}
    </Link>
  )
}
