import type { JSX } from '@opentui/solid'
import { For } from 'solid-js'
import { stringWidth } from '../../../ink/stringWidth.js'

type Props = {
  headers: string[]
  rows: string[][]
  maxWidth?: number
}

/**
 * Renders a markdown-style table with proper column alignment.
 */
export function MarkdownTable(props: Props): JSX.Element {
  const columnWidths = () => {
    const widths = props.headers.map(h => stringWidth(h))
    for (const row of props.rows) {
      for (let i = 0; i < row.length; i++) {
        if (i < widths.length) {
          widths[i] = Math.max(widths[i]!, stringWidth(row[i] ?? ''))
        }
      }
    }
    return widths
  }

  const padCell = (text: string, width: number) => {
    const textWidth = stringWidth(text)
    const padding = Math.max(0, width - textWidth)
    return text + ' '.repeat(padding)
  }

  const renderRow = (cells: string[]) => {
    const cols = columnWidths()
    return cells
      .map((cell, i) => padCell(cell ?? '', cols[i] ?? 0))
      .join(' | ')
  }

  const separator = () => {
    const cols = columnWidths()
    return cols.map(w => '-'.repeat(w)).join('-|-')
  }

  return (
    <box flexDirection="column">
      <text>{renderRow(props.headers)}</text>
      <text>{separator()}</text>
      <For each={props.rows}>{(row) => (
        <text>{renderRow(row)}</text>
      )}</For>
    </box>
  )
}
