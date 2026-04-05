/**
 * Renders a column of Feed components with dividers between them.
 *
 * SolidJS + OpenTUI port of src/components/LogoV2/FeedColumn.tsx.
 */

import { For, Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { Divider } from '../design-system/Divider.solid.js'
import type { FeedConfig } from './Feed.solid.js'
import { calculateFeedWidth, Feed } from './Feed.solid.js'

interface FeedColumnProps {
  feeds: FeedConfig[]
  maxWidth: number
}

export function FeedColumn(props: FeedColumnProps) {
  const feedWidths = () => props.feeds.map((feed) => calculateFeedWidth(feed))
  const maxOfAllFeeds = () => Math.max(...feedWidths())
  const actualWidth = () => Math.min(maxOfAllFeeds(), props.maxWidth)

  return (
    <box flexDirection="column">
      <For each={props.feeds}>
        {(feed, index) => (
          <>
            <Feed config={feed} actualWidth={actualWidth()} />
            <Show when={index() < props.feeds.length - 1}>
              <Divider color="startupAccent" width={actualWidth()} />
            </Show>
          </>
        )}
      </For>
    </box>
  )
}
