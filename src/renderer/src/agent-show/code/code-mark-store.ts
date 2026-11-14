import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import type { CodeLineRange } from './code-line-range'

/** `seq` orders marks by when they were shown, so an editor can fit the newest. */
export type CodeMark = CodeLineRange & { mark: string; note?: string; seq?: number }
/** One owner's marks by absolute file path. */
export type OwnerCodeMarks = ReadonlyMap<string, readonly CodeMark[]>

/**
 * Places `next` among an owner's marks: replaces them all unless keepOthers; a reused label
 * moves, and a kept mark whose lines overlap `next` on the same file gives way to it.
 */
export function placeOwnerCodeMark(
  previous: OwnerCodeMarks | undefined,
  filePath: string,
  next: CodeLineRange & { mark?: string; note?: string; seq?: number },
  keepOthers: boolean
): { marks: Map<string, CodeMark[]>; placed: CodeMark } {
  const kept = new Map<string, CodeMark[]>()
  if (keepOthers && previous) {
    for (const [path, marks] of previous) {
      kept.set(
        path,
        marks.filter(
          (mark) =>
            mark.mark !== next.mark &&
            (path !== filePath || mark.endLine < next.startLine || mark.startLine > next.endLine)
        )
      )
    }
  }
  const used = new Set([...kept.values()].flat().map((mark) => mark.mark))
  let label = next.mark
  for (let n = 1; !label; n += 1) {
    label = used.has(String(n)) ? undefined : String(n)
  }
  const placed: CodeMark = {
    mark: label,
    startLine: next.startLine,
    endLine: next.endLine,
    ...(next.note ? { note: next.note } : {}),
    ...(next.seq === undefined ? {} : { seq: next.seq })
  }
  const onFile = [...(kept.get(filePath) ?? []), placed].sort((a, b) => a.startLine - b.startLine)
  kept.set(filePath, onFile)
  for (const [path, marks] of kept) {
    if (marks.length === 0) {
      kept.delete(path)
    }
  }
  return { marks: kept, placed }
}

const marksByOwner = new Map<string, OwnerCodeMarks>()
let shownCount = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

// Why worktree too: a null owner (plain terminal) must not share marks across worktrees.
export function codeMarkOwnerKey(context: AgentShowContext): string {
  return `${context.worktreeId}\u0000${context.ownerTabId ?? ''}`
}

export function putCodeMark(
  ownerKey: string,
  filePath: string,
  next: CodeLineRange & { mark?: string; note?: string },
  keepOthers: boolean
): CodeMark {
  const { marks, placed } = placeOwnerCodeMark(
    marksByOwner.get(ownerKey),
    filePath,
    { ...next, seq: (shownCount += 1) },
    keepOthers
  )
  marksByOwner.set(ownerKey, marks)
  notify()
  return placed
}

export function clearOwnerCodeMarks(ownerKey: string): void {
  if (marksByOwner.delete(ownerKey)) {
    notify()
  }
}

/** One owner's marks by file, for tidying the tabs it opened. */
export function ownerCodeMarks(ownerKey: string): OwnerCodeMarks | undefined {
  return marksByOwner.get(ownerKey)
}

/** Every owner's marks on one file, for the editors showing it. */
export function codeMarksOnFile(filePath: string): CodeMark[] {
  return [...marksByOwner.values()].flatMap((marks) => marks.get(filePath) ?? [])
}

export function subscribeCodeMarks(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
