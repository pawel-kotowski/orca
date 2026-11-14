import { buildTreeMarkIndex, type TreeMarkIndex, type TreeMarkSet } from './tree-mark-index'

// Why module state: the explorer rows subscribe here, so no slice in the app store is needed.
const sets = new Map<string, TreeMarkSet>()
const listeners = new Set<() => void>()
let index: TreeMarkIndex = { sets: [] }

function publish(): void {
  index = buildTreeMarkIndex(sets.values())
  for (const listener of listeners) {
    listener()
  }
}

export function setTreeMarkSet(ownerKey: string, set: TreeMarkSet): void {
  sets.set(ownerKey, set)
  publish()
}

export function clearTreeMarkSet(ownerKey: string): void {
  if (sets.delete(ownerKey)) {
    publish()
  }
}

export function getTreeMarkSet(ownerKey: string): TreeMarkSet | undefined {
  return sets.get(ownerKey)
}

export function subscribeTreeMarks(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTreeMarkIndex(): TreeMarkIndex {
  return index
}
