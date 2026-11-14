import { useSyncExternalStore } from 'react'
import { rowTreeMark, type TreeRowMark } from './tree-mark-index'
import { getTreeMarkIndex, subscribeTreeMarks } from './tree-marks-store'

const NO_MARK: TreeRowMark = { marked: false, dimmed: false }

/** The highlight, label and dim state an agent's `orca show tree` gave this explorer row. */
export function useTreeRowMark(rowPath: string): TreeRowMark {
  const index = useSyncExternalStore(subscribeTreeMarks, getTreeMarkIndex)
  return index.sets.length === 0 ? NO_MARK : rowTreeMark(index, rowPath)
}
