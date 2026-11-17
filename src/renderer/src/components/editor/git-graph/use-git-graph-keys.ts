// Local (glass build): keys in the Git Graph list. ↑/↓ move the selection; h, m and d jump to
// HEAD, main and development; b switches the Branches view on and off, v cycles the three views;
// n and Shift+N step through highlighted merges; / goes to Find; Esc drops the merge highlight,
// then stops following a branch, then closes the selected commit.
import type React from 'react'
import type { GitGraphDensity } from './git-graph-toolbar'
import type { GitGraphJumpTarget } from './use-git-graph-jump'

const VIEWS: GitGraphDensity[] = ['compact', 'detailed', 'branches']

export function useGitGraphKeys({
  density,
  setDensity,
  jumps,
  moveSelection,
  onNextMark,
  onEscape
}: {
  density: GitGraphDensity
  setDensity: (next: GitGraphDensity) => void
  jumps: {
    head?: GitGraphJumpTarget
    main?: GitGraphJumpTarget
    develop?: GitGraphJumpTarget
    jump: (target: GitGraphJumpTarget) => void
  }
  moveSelection: (step: number) => void
  onNextMark: (step: 1 | -1) => void
  onEscape: () => void
}): (event: React.KeyboardEvent<HTMLDivElement>) => void {
  return (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault()
      onNextMark(event.shiftKey ? -1 : 1)
      return
    }
    const jumpTo = (target?: GitGraphJumpTarget): void => {
      if (target) {
        jumps.jump(target)
      }
    }
    const actions: Record<string, () => void> = {
      ArrowDown: () => moveSelection(1),
      ArrowUp: () => moveSelection(-1),
      Escape: onEscape,
      h: () => jumpTo(jumps.head),
      m: () => jumpTo(jumps.main),
      d: () => jumpTo(jumps.develop),
      b: () => setDensity(density === 'branches' ? 'detailed' : 'branches'),
      v: () => setDensity(VIEWS[(VIEWS.indexOf(density) + 1) % VIEWS.length]!),
      '/': () =>
        (
          event.currentTarget.ownerDocument.querySelector(
            '[data-git-graph-find]'
          ) as HTMLInputElement | null
        )?.focus()
    }
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }
}
