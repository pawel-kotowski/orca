import type { TabGroupLayoutNode } from '../../../../shared/tab-types'

type Side = 'first' | 'second'
export type LayoutPath = readonly Side[]

/** The column right of the chat where `orca show` puts code: its layout path and panes in order. */
export type CodeStage = { path: LayoutPath; leaves: string[] }

function pathTo(node: TabGroupLayoutNode, groupId: string, path: Side[] = []): Side[] | null {
  if (node.type === 'leaf') {
    return node.groupId === groupId ? path : null
  }
  return (
    pathTo(node.first, groupId, [...path, 'first']) ??
    pathTo(node.second, groupId, [...path, 'second'])
  )
}

export function layoutNodeAt(
  node: TabGroupLayoutNode,
  path: LayoutPath
): TabGroupLayoutNode | null {
  let current: TabGroupLayoutNode = node
  for (const side of path) {
    if (current.type !== 'split') {
      return null
    }
    current = current[side]
  }
  return current
}

export function layoutLeaves(node: TabGroupLayoutNode): string[] {
  return node.type === 'leaf'
    ? [node.groupId]
    : [...layoutLeaves(node.first), ...layoutLeaves(node.second)]
}

/** The subtree beside the chat: the `second` side of its nearest side-by-side split it is `first` in. */
export function findCodeStage(layout: TabGroupLayoutNode, ownerGroupId: string): CodeStage | null {
  const ownerPath = pathTo(layout, ownerGroupId)
  if (!ownerPath) {
    return null
  }
  for (let depth = ownerPath.length - 1; depth >= 0; depth -= 1) {
    const parent = layoutNodeAt(layout, ownerPath.slice(0, depth))
    if (parent?.type === 'split' && parent.direction === 'horizontal') {
      if (ownerPath[depth] !== 'first') {
        return null
      }
      const path = [...ownerPath.slice(0, depth), 'second' as const]
      return { path, leaves: layoutLeaves(parent.second) }
    }
  }
  return null
}

/** The panes stacked top to bottom with `groupId`, inside `within`: the subtree a `below` split shares. */
export function verticalStackAround(
  layout: TabGroupLayoutNode,
  within: LayoutPath,
  groupId: string
): { path: LayoutPath; leaves: string[] } | null {
  const path = pathTo(layout, groupId)
  if (!path) {
    return null
  }
  let depth = path.length
  while (depth > within.length) {
    const parent = layoutNodeAt(layout, path.slice(0, depth - 1))
    if (parent?.type !== 'split' || parent.direction !== 'vertical') {
      break
    }
    depth -= 1
  }
  const stackPath = path.slice(0, depth)
  const node = layoutNodeAt(layout, stackPath)
  return node ? { path: stackPath, leaves: layoutLeaves(node) } : null
}

const MIN_RATIO = 0.12

/** Split ratios that give each pane of a stack a height in proportion to what it needs. */
export function stackSplitRatios(
  layout: TabGroupLayoutNode,
  stackPath: LayoutPath,
  needPx: (groupId: string) => number
): { path: string; ratio: number }[] {
  const ratios: { path: string; ratio: number }[] = []
  const visit = (node: TabGroupLayoutNode, path: LayoutPath): number => {
    if (node.type === 'leaf') {
      return needPx(node.groupId)
    }
    const first = visit(node.first, [...path, 'first'])
    const second = visit(node.second, [...path, 'second'])
    if (node.direction === 'vertical' && first + second > 0) {
      const ratio = Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, first / (first + second)))
      ratios.push({ path: path.join('.'), ratio })
    }
    return node.direction === 'vertical' ? first + second : Math.max(first, second)
  }
  const node = layoutNodeAt(layout, stackPath)
  if (node) {
    visit(node, stackPath)
  }
  return ratios
}
