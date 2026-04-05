import type { JSX } from '@opentui/solid'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { useSettings } from '../../../hooks/useSettings.js'
import { useTheme } from '../../../ink.js'
import { isFullscreenEnvEnabled } from '../../../utils/fullscreen.js'
import sliceAnsi from '../../../utils/sliceAnsi.js'
import { countCharInString } from '../../../utils/stringUtils.js'
import { HighlightedCodeFallback } from '../../components/HighlightedCode/Fallback.js'
import { expectColorFile } from '../../components/StructuredDiff/colorDiff.js'

type Props = {
  code: string
  filePath: string
  width?: number
  dim?: boolean
}

const DEFAULT_WIDTH = 80

export function HighlightedCode(props: Props): JSX.Element {
  let ref: any = undefined
  const [measuredWidth, setMeasuredWidth] = createSignal(props.width || DEFAULT_WIDTH)
  const [theme] = useTheme()
  const settings = useSettings()
  const syntaxHighlightingDisabled = () =>
    settings.syntaxHighlightingDisabled ?? false

  const colorFile = createMemo(() => {
    if (syntaxHighlightingDisabled()) {
      return null
    }
    const ColorFile = expectColorFile()
    if (!ColorFile) {
      return null
    }
    return new ColorFile(props.code, props.filePath)
  })

  createEffect(() => {
    if (!props.width && ref) {
      // In OpenTUI, measurement may differ; use ref width if available
      const elementWidth = ref.offsetWidth ?? 0
      if (elementWidth > 0) {
        setMeasuredWidth(elementWidth - 2)
      }
    }
  })

  const lines = createMemo(() => {
    const cf = colorFile()
    if (cf === null) {
      return null
    }
    return cf.render(theme, measuredWidth(), props.dim ?? false)
  })

  const gutterWidth = createMemo(() => {
    if (!isFullscreenEnvEnabled()) return 0
    const lineCount = countCharInString(props.code, '\n') + 1
    return lineCount.toString().length + 2
  })

  return (
    <box ref={ref}>
      <Show
        when={lines()}
        fallback={
          <HighlightedCodeFallback
            code={props.code}
            filePath={props.filePath}
            dim={props.dim ?? false}
            skipColoring={syntaxHighlightingDisabled()}
          />
        }
      >
        <box flexDirection="column">
          <For each={lines()!}>
            {(line, i) => (
              <Show
                when={gutterWidth() > 0}
                fallback={<text>{line}</text>}
              >
                <CodeLine line={line} gutterWidth={gutterWidth()} />
              </Show>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}

function CodeLine(props: {
  line: string
  gutterWidth: number
}): JSX.Element {
  const gutter = () => sliceAnsi(props.line, 0, props.gutterWidth)
  const content = () => sliceAnsi(props.line, props.gutterWidth)
  return (
    <box flexDirection="row">
      <text>{gutter()}</text>
      <text>{content()}</text>
    </box>
  )
}
