import type { JSX } from '@opentui/solid'
import { Show } from 'solid-js'
import { pathToFileURL } from 'url'
import Link from '../../../ink/components/Link.js'
import { supportsHyperlinks } from '../../../ink/supports-hyperlinks.js'
import { getStoredImagePath } from '../../../utils/imageStore.js'
import type { Theme } from '../../../utils/theme.js'

type Props = {
  imageId: number
  backgroundColor?: keyof Theme
  isSelected?: boolean
}

/**
 * Renders an image reference like [Image #1] as a clickable link.
 * When clicked, opens the stored image file in the default viewer.
 *
 * Falls back to styled text if:
 * - Terminal doesn't support hyperlinks
 * - Image file is not found in the store
 */
export function ClickableImageRef(props: Props): JSX.Element {
  const isSelected = () => props.isSelected ?? false
  const imagePath = () => getStoredImagePath(props.imageId)
  const displayText = () => `[Image #${props.imageId}]`

  return (
    <Show
      when={imagePath() && supportsHyperlinks()}
      fallback={
        <text bg={props.backgroundColor} inverse={isSelected()}>
          {displayText()}
        </text>
      }
    >
      <Link
        url={pathToFileURL(imagePath()!).href}
        fallback={
          <text bg={props.backgroundColor} inverse={isSelected()}>
            {displayText()}
          </text>
        }
      >
        <text
          bg={props.backgroundColor}
          inverse={isSelected()}
          bold={isSelected()}
        >
          {displayText()}
        </text>
      </Link>
    </Show>
  ) as JSX.Element
}
