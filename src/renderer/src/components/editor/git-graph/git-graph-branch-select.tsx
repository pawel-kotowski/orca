// Local (glass build): which branches the classic Git Graph draws (Paweł, 2026-11-17: "this all
// branches / current branch view is confusing to me, I want to see all branches always + a view
// to select many / unselect would be useful"). Every branch is drawn until some are unticked; the
// graph reloads once the menu closes, not on every tick.
import React, { useMemo, useState } from 'react'
import { ChevronDown, Cloud, GitBranch, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type {
  GitHistoryItemRef,
  GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'

const ORDER = { branches: 0, 'remote branches': 1, tags: 2, commits: 3 } as const
/** The history call takes at most this many named refs (validateHistoryRefs). */
const MAX_NAMED_REFS = 1000

export function GitGraphBranchSelect({
  refs,
  value,
  pinned,
  headRefId,
  onChange
}: {
  refs: readonly GitHistoryItemRef[]
  value: GitHistoryRefs
  pinned: readonly string[]
  headRefId?: string
  onChange: (next: GitHistoryRefs) => void
}): React.JSX.Element {
  const selectable = useMemo(
    () =>
      refs
        .filter((ref) => ref.revision && !ref.name.endsWith('/HEAD'))
        .sort(
          (a, b) =>
            ORDER[a.category ?? 'commits'] - ORDER[b.category ?? 'commits'] ||
            a.name.localeCompare(b.name)
        ),
    [refs]
  )
  const [draft, setDraft] = useState<Set<string> | null>(null)
  const [query, setQuery] = useState('')
  const chosen = (current: GitHistoryRefs): Set<string> =>
    new Set(Array.isArray(current) ? current : selectable.map((ref) => ref.id))
  const open = draft !== null
  const ticked = draft ?? chosen(value)
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? selectable.filter((ref) => ref.name.toLowerCase().includes(needle)) : selectable
  }, [query, selectable])

  const apply = (): void => {
    if (!draft) {
      return
    }
    const everything = selectable.every((ref) => draft.has(ref.id))
    const next: GitHistoryRefs =
      everything || draft.size === 0 || draft.size > MAX_NAMED_REFS ? 'all' : [...draft].sort()
    if (JSON.stringify(next) !== JSON.stringify(value)) {
      onChange(next)
    }
  }
  const set = (ids: Iterable<string>): void => setDraft(new Set(ids))
  const label = Array.isArray(value)
    ? `${value.length} of ${selectable.length} branches`
    : 'All branches'
  const pinnedIds = selectable
    .filter(
      (ref) =>
        ref.id === headRefId ||
        pinned.includes(
          ref.category === 'remote branches' ? ref.name.replace(/^[^/]+\//, '') : ref.name
        )
    )
    .map((ref) => ref.id)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(chosen(value))
        } else {
          apply()
          setDraft(null)
          setQuery('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1">
          {label}
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[90vw] p-2 text-xs">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter branches and tags"
          className="mb-1.5 h-7 w-full rounded-md border border-border bg-transparent px-2 outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="mb-1.5 flex flex-wrap gap-1">
          <Button variant="ghost" size="xs" onClick={() => set(selectable.map((ref) => ref.id))}>
            All
          </Button>
          <Button variant="ghost" size="xs" onClick={() => set(pinnedIds)}>
            Only pinned and current
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              set(selectable.filter((ref) => ref.category === 'branches').map((ref) => ref.id))
            }
          >
            Only local
          </Button>
          {query && (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => set([...ticked, ...shown.map((ref) => ref.id)])}
              >
                Tick matches
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  const drop = new Set(shown.map((ref) => ref.id))
                  set([...ticked].filter((id) => !drop.has(id)))
                }}
              >
                Untick matches
              </Button>
            </>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-sleek">
          {shown.map((ref) => (
            <label
              key={ref.id}
              className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-accent/60"
            >
              <Checkbox
                className="mt-0.5"
                checked={ticked.has(ref.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(ticked)
                  if (checked) {
                    next.add(ref.id)
                  } else {
                    next.delete(ref.id)
                  }
                  setDraft(next)
                }}
              />
              {ref.category === 'tags' ? (
                <Tag className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              ) : ref.category === 'remote branches' ? (
                <Cloud className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              ) : (
                <GitBranch className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 break-all">{ref.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-muted-foreground">
          {ticked.size} of {selectable.length} ticked. The graph redraws when this closes.
        </p>
      </PopoverContent>
    </Popover>
  )
}
