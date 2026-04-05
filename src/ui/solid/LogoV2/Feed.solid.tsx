/**
 * Feed component displaying a titled list of lines with optional timestamps.
 *
 * SolidJS + OpenTUI port of src/components/LogoV2/Feed.tsx.
 */

import { Show, For } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { stringWidth } from '../../../ink/stringWidth.js'
import { truncate } from '../../../utils/format.js'

export type FeedLine = {
  text: string
  timestamp?: string
}

export type FeedConfig = {
  title: string
  lines: FeedLine[]
  footer?: string
  emptyMessage?: string
  customContent?: { content: JSX.Element; width: number }
}

interface FeedProps {
  config: FeedConfig
  actualWidth: number
}

export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage, customContent } = config

  let maxWidth = stringWidth(title)

  if (customContent !== undefined) {
    maxWidth = Math.max(maxWidth, customContent.width)
  } else if (lines.length === 0 && emptyMessage) {
    maxWidth = Math.max(maxWidth, stringWidth(emptyMessage))
  } else {
    const gap = '  '
    const maxTimestampWidth = Math.max(
      0,
      ...lines.map((line) => (line.timestamp ? stringWidth(line.timestamp) : 0)),
    )

    for (const line of lines) {
      const timestampWidth = maxTimestampWidth > 0 ? maxTimestampWidth : 0
      const lineWidth =
        stringWidth(line.text) +
        (timestampWidth > 0 ? timestampWidth + gap.length : 0)
      maxWidth = Math.max(maxWidth, lineWidth)
    }
  }

  if (footer) {
    maxWidth = Math.max(maxWidth, stringWidth(footer))
  }

  return maxWidth
}

export function Feed(props: FeedProps) {
  const config = () => props.config
  const actualWidth = () => props.actualWidth

  const maxTimestampWidth = () =>
    Math.max(
      0,
      ...config().lines.map((line) =>
        line.timestamp ? stringWidth(line.timestamp) : 0,
      ),
    )

  return (
    <box flexDirection="column" width={actualWidth()}>
      <text fg="startupAccent">
        <b>{config().title}</b>
      </text>
      <Show when={config().customContent} fallback={
        <Show
          when={!(config().lines.length === 0 && config().emptyMessage)}
          fallback={
            <text dimmed>{truncate(config().emptyMessage!, actualWidth())}</text>
          }
        >
          <For each={config().lines}>
            {(line, index) => {
              const textWidth = () =>
                Math.max(
                  10,
                  actualWidth() -
                    (maxTimestampWidth() > 0 ? maxTimestampWidth() + 2 : 0),
                )

              return (
                <text>
                  <Show when={maxTimestampWidth() > 0}>
                    <text dimmed>
                      {(line.timestamp || '').padEnd(maxTimestampWidth())}
                    </text>
                    {'  '}
                  </Show>
                  <text>{truncate(line.text, textWidth())}</text>
                </text>
              )
            }}
          </For>
          <Show when={config().footer}>
            <text dimmed>
              <i>{truncate(config().footer!, actualWidth())}</i>
            </text>
          </Show>
        </Show>
      }>
        {(custom) => (
          <>
            {custom().content}
            <Show when={config().footer}>
              <text dimmed>
                <i>{truncate(config().footer!, actualWidth())}</i>
              </text>
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
