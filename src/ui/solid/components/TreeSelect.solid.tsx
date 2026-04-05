import { createSignal, createMemo, Show, For, type JSXElement } from 'solid-js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { type OptionWithDescription, Select } from '../../solid/components/CustomSelect/select.js'

export type TreeNode<T> = {
  id: string | number
  value: T
  label: string
  description?: string
  dimDescription?: boolean
  children?: TreeNode<T>[]
  metadata?: Record<string, unknown>
}

type FlattenedNode<T> = {
  node: TreeNode<T>
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  parentId?: string | number
}

export type TreeSelectProps<T> = {
  readonly nodes: TreeNode<T>[]
  readonly onSelect: (node: TreeNode<T>) => void
  readonly onCancel?: () => void
  readonly onFocus?: (node: TreeNode<T>) => void
  readonly focusNodeId?: string | number
  readonly visibleOptionCount?: number
  readonly layout?: 'compact' | 'expanded' | 'compact-vertical'
  readonly isDisabled?: boolean
  readonly hideIndexes?: boolean
  readonly isNodeExpanded?: (nodeId: string | number) => boolean
  readonly onNodeExpanded?: (nodeId: string | number) => void
  readonly onNodeCollapsed?: (nodeId: string | number) => void
}

function flattenNodes<T>(
  nodes: TreeNode<T>[],
  expandedIds: Set<string | number>,
  depth: number = 0,
  parentId?: string | number,
): FlattenedNode<T>[] {
  const result: FlattenedNode<T>[] = []
  for (const node of nodes) {
    const hasChildren = !!(node.children && node.children.length > 0)
    const isExpanded = hasChildren && expandedIds.has(node.id)
    result.push({ node, depth, isExpanded, hasChildren, parentId })
    if (isExpanded && node.children) {
      result.push(
        ...flattenNodes(node.children, expandedIds, depth + 1, node.id),
      )
    }
  }
  return result
}

export function TreeSelect<T>(props: TreeSelectProps<T>): JSXElement {
  const [expandedIds, setExpandedIds] = createSignal<Set<string | number>>(
    () => {
      const initial = new Set<string | number>()
      if (props.isNodeExpanded) {
        const addExpanded = (nodes: TreeNode<T>[]) => {
          for (const node of nodes) {
            if (props.isNodeExpanded!(node.id)) {
              initial.add(node.id)
            }
            if (node.children) addExpanded(node.children)
          }
        }
        addExpanded(props.nodes)
      }
      return initial
    },
  )

  let selectRef: any = undefined

  const flattened = createMemo(() =>
    flattenNodes(props.nodes, expandedIds()),
  )

  const options = createMemo<OptionWithDescription[]>(() =>
    flattened().map((flatNode) => {
      const indent = '  '.repeat(flatNode.depth)
      const prefix = flatNode.hasChildren
        ? flatNode.isExpanded
          ? '▾ '
          : '▸ '
        : '  '
      return {
        label: `${indent}${prefix}${flatNode.node.label}`,
        value: String(flatNode.node.id),
        description: flatNode.node.description,
        dimDescription: flatNode.node.dimDescription,
      }
    }),
  )

  const focusIndex = createMemo(() => {
    if (props.focusNodeId == null) return undefined
    const idx = flattened().findIndex(
      (f) => f.node.id === props.focusNodeId,
    )
    return idx >= 0 ? idx : undefined
  })

  const handleChange = (value: string) => {
    const flatNode = flattened().find((f) => String(f.node.id) === value)
    if (!flatNode) return

    if (flatNode.hasChildren) {
      const newExpanded = new Set(expandedIds())
      if (newExpanded.has(flatNode.node.id)) {
        newExpanded.delete(flatNode.node.id)
        props.onNodeCollapsed?.(flatNode.node.id)
      } else {
        newExpanded.add(flatNode.node.id)
        props.onNodeExpanded?.(flatNode.node.id)
      }
      setExpandedIds(newExpanded)
    } else {
      props.onSelect(flatNode.node)
    }
  }

  const handleFocus = (value: string) => {
    if (!props.onFocus) return
    const flatNode = flattened().find((f) => String(f.node.id) === value)
    if (flatNode) {
      props.onFocus(flatNode.node)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const currentIdx = focusIndex()
    if (currentIdx == null) return
    const flatNode = flattened()[currentIdx]
    if (!flatNode) return

    if (e.key === 'right' && flatNode.hasChildren && !flatNode.isExpanded) {
      e.preventDefault()
      const newExpanded = new Set(expandedIds())
      newExpanded.add(flatNode.node.id)
      setExpandedIds(newExpanded)
      props.onNodeExpanded?.(flatNode.node.id)
    } else if (
      e.key === 'left' &&
      flatNode.hasChildren &&
      flatNode.isExpanded
    ) {
      e.preventDefault()
      const newExpanded = new Set(expandedIds())
      newExpanded.delete(flatNode.node.id)
      setExpandedIds(newExpanded)
      props.onNodeCollapsed?.(flatNode.node.id)
    } else if (e.key === 'left' && flatNode.parentId != null) {
      e.preventDefault()
      // Focus parent handled by onFocus callback
    }
  }

  return (
    <box onKeyDown={handleKeyDown}>
      <Select
        ref={selectRef}
        options={options()}
        onChange={handleChange}
        onCancel={props.onCancel}
        onFocus={handleFocus}
        focusedIndex={focusIndex()}
        visibleOptionCount={props.visibleOptionCount}
        layout={props.layout}
        isDisabled={props.isDisabled}
        hideIndexes={props.hideIndexes}
      />
    </box>
  )
}
