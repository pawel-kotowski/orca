// Local (glass build): "Go to branch…" in the Git Graph toolbar: every branch and tag of the repo,
// filtered as you type, Enter jumps to the first match.
import React, { useMemo, useState } from 'react'
import { ChevronDown, Cloud, GitBranch, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import type { GitGraphJumpTarget } from './use-git-graph-jump'

const ORDER = { branches: 0, 'remote branches': 1, tags: 2, commits: 3 } as const

export function GitGraphBranchPicker({
  refs,
  onJump
}: {
  refs: readonly GitHistoryItemRef[]
  onJump: (target: GitGraphJumpTarget) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return refs
      .filter(
        (ref) =>
          ref.revision &&
          !ref.name.endsWith('/HEAD') &&
          (!needle || ref.name.toLowerCase().includes(needle))
      )
      .sort(
        (a, b) =>
          ORDER[a.category ?? 'commits'] - ORDER[b.category ?? 'commits'] ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 300)
  }, [query, refs])
  const pick = (ref: GitHistoryItemRef): void => {
    setOpen(false)
    setQuery('')
    onJump({ label: ref.name, revision: ref.revision!, ref })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
          <GitBranch className="size-3.5" />
          Branch…
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem] max-w-[90vw] p-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event) && matches[0]) {
              event.preventDefault()
              pick(matches[0])
            }
          }}
          placeholder="Go to branch or tag"
          className="mb-1.5 h-7 w-full rounded-md border border-border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="max-h-80 overflow-y-auto scrollbar-sleek">
          {matches.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No branch matches</div>
          )}
          {matches.map((ref) => (
            <button
              key={ref.id}
              type="button"
              className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
              onClick={() => pick(ref)}
            >
              {ref.category === 'tags' ? (
                <Tag className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              ) : ref.category === 'remote branches' ? (
                <Cloud className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              ) : (
                <GitBranch className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 break-all">{ref.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
