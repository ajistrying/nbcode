import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { pathToFileURL } from 'url'
import Link from '../../../ink/components/Link.js'
import { supportsHyperlinks } from '../../../ink/supports-hyperlinks.js'
import { getStoredImagePath } from '../../../utils/imageStore.js'
import { MessageResponse } from '../../../components/MessageResponse.js'

type Props = {
  imageId?: number
  addMargin?: boolean
}

export function UserImageMessage(props: Props): JSX.Element {
  const label = () => props.imageId ? `[Image #${props.imageId}]` : '[Image]'
  const imagePath = () => props.imageId ? getStoredImagePath(props.imageId) : null

  const content = () => {
    const path = imagePath()
    return path && supportsHyperlinks()
      ? <Link url={pathToFileURL(path).href}><text>{label()}</text></Link>
      : <text>{label()}</text>
  }

  return (
    <Show when={props.addMargin} fallback={<MessageResponse>{content()}</MessageResponse>}>
      <box marginTop={1}>{content()}</box>
    </Show>
  )
}
