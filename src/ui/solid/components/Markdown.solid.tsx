import type { JSX } from '@opentui/solid'
import { createMemo, For, Show, Suspense } from 'solid-js'
import { marked, type Token, type Tokens } from 'marked'
import { useSettings } from '../../../hooks/useSettings.js'
import { useTheme } from '../../../ink.js'
import {
  type CliHighlight,
  getCliHighlightPromise,
} from '../../../utils/cliHighlight.js'
import { hashContent } from '../../../utils/hash.js'
import { configureMarked, formatToken } from '../../../utils/markdown.js'
import { stripPromptXMLTags } from '../../../utils/messages.js'
import { MarkdownTable } from './MarkdownTable.solid.js'

type Props = {
  children: string
  dimColor?: boolean
}

const TOKEN_CACHE_MAX = 500
const tokenCache = new Map<string, Token[]>()

const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /
function hasMarkdownSyntax(s: string): boolean {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s)
}

function cachedLexer(content: string): Token[] {
  if (!hasMarkdownSyntax(content)) {
    return [
      {
        type: 'paragraph',
        raw: content,
        text: content,
        tokens: [{ type: 'text', raw: content, text: content }],
      } as Token,
    ]
  }
  const key = hashContent(content)
  const hit = tokenCache.get(key)
  if (hit) {
    tokenCache.delete(key)
    tokenCache.set(key, hit)
    return hit
  }
  const tokens = marked.lexer(content)
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value
    if (first !== undefined) tokenCache.delete(first)
  }
  tokenCache.set(key, tokens)
  return tokens
}

export function Markdown(props: Props): JSX.Element {
  const settings = useSettings()

  return (
    <Show
      when={!settings.syntaxHighlightingDisabled}
      fallback={<MarkdownBody children={props.children} dimColor={props.dimColor} highlight={null} />}
    >
      <Suspense fallback={<MarkdownBody children={props.children} dimColor={props.dimColor} highlight={null} />}>
        <MarkdownWithHighlight children={props.children} dimColor={props.dimColor} />
      </Suspense>
    </Show>
  )
}

function MarkdownWithHighlight(props: Props): JSX.Element {
  // In SolidJS, `use()` from React is not available. We use createResource or
  // resolve the promise in an effect. Here we assume highlight resolves
  // synchronously after first load (cached promise pattern).
  const [highlight, setHighlight] = ((): [() => CliHighlight | null, any] => {
    let val: CliHighlight | null = null
    const promise = getCliHighlightPromise()
    promise.then(h => { val = h })
    return [() => val, null]
  })()

  return <MarkdownBody children={props.children} dimColor={props.dimColor} highlight={highlight()} />
}

function MarkdownBody(props: Props & { highlight: CliHighlight | null }): JSX.Element {
  const [theme] = useTheme()
  configureMarked()

  const elements = createMemo(() => {
    const tokens = cachedLexer(stripPromptXMLTags(props.children))
    const result: JSX.Element[] = []
    let nonTableContent = ''

    function flushNonTableContent(): void {
      if (nonTableContent) {
        const content = nonTableContent.trim()
        result.push(
          <text dimmed={props.dimColor}>{content}</text>,
        )
        nonTableContent = ''
      }
    }

    for (const token of tokens) {
      if (token.type === 'table') {
        flushNonTableContent()
        result.push(
          <MarkdownTable
            token={token as Tokens.Table}
            highlight={props.highlight}
          />,
        )
      } else {
        nonTableContent += formatToken(token, theme, 0, null, null, props.highlight)
      }
    }

    flushNonTableContent()
    return result
  })

  return (
    <box flexDirection="column" gap={1}>
      <For each={elements()}>
        {(el) => el}
      </For>
    </box>
  )
}

type StreamingProps = {
  children: string
}

export function StreamingMarkdown(props: StreamingProps): JSX.Element {
  configureMarked()

  const stripped = () => stripPromptXMLTags(props.children)

  let stablePrefix = ''

  const parts = createMemo(() => {
    const s = stripped()
    if (!s.startsWith(stablePrefix)) {
      stablePrefix = ''
    }

    const boundary = stablePrefix.length
    const tokens = marked.lexer(s.substring(boundary))

    let lastContentIdx = tokens.length - 1
    while (lastContentIdx >= 0 && tokens[lastContentIdx]!.type === 'space') {
      lastContentIdx--
    }
    let advance = 0
    for (let i = 0; i < lastContentIdx; i++) {
      advance += tokens[i]!.raw.length
    }
    if (advance > 0) {
      stablePrefix = s.substring(0, boundary + advance)
    }

    return {
      stable: stablePrefix,
      unstable: s.substring(stablePrefix.length),
    }
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={parts().stable}>
        <Markdown>{parts().stable}</Markdown>
      </Show>
      <Show when={parts().unstable}>
        <Markdown>{parts().unstable}</Markdown>
      </Show>
    </box>
  )
}
