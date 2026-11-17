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
import { gitGraphPeople } from './git-graph-author-color'

/** A branch's name without its remote: `origin/feature/x` → `feature/x`. */
function branchOf(ref: GitHistoryItemRef): string {
  return ref.category === 'remote branches' ? ref.name.replace(/^[^/]+\//, '') : ref.name
}

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
  const [authorPick, setAuthorPick] = useState<string[]>([])
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
  // Any other choice (a quick button, a tick) is no longer "by author".
  const set = (ids: Iterable<string>): void => {
    setAuthorPick([])
    setDraft(new Set(ids))
  }
  const pinnedIds = selectable
    .filter((ref) => ref.id === headRefId || pinned.includes(branchOf(ref)))
    .map((ref) => ref.id)
  // By author (Paweł, 2026-11-17: "filter branches by author option but only for non main non
  // development"): pinned branches always stay; any other branch is its newest commit's author's.
  // One person under two emails or two spellings is one chip (gitGraphPeople).
  const personOf = useMemo(() => gitGraphPeople(selectable), [selectable])
  const authorKey = (ref: GitHistoryItemRef): string => personOf(ref.author, ref.authorEmail)
  const authors = useMemo(() => {
    const byKey = new Map<string, { name: string; count: number; names: Map<string, number> }>()
    for (const ref of selectable) {
      const key = personOf(ref.author, ref.authorEmail)
      if (ref.category === 'tags' || pinned.includes(branchOf(ref)) || !key) {
        continue
      }
      const entry = byKey.get(key) ?? { name: '', count: 0, names: new Map<string, number>() }
      entry.count += 1
      if (ref.author) {
        entry.names.set(ref.author, (entry.names.get(ref.author) ?? 0) + 1)
      }
      byKey.set(key, entry)
    }
    for (const entry of byKey.values()) {
      // The spelling the person uses most.
      entry.name = [...entry.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?'
    }
    return [...byKey].sort((a, b) => b[1].count - a[1].count)
  }, [personOf, pinned, selectable])
  // After `authors`: the label names the picked ones (reading it earlier crashed the tab, 2026-11-17).
  const label = !Array.isArray(value)
    ? 'All branches'
    : authorPick.length > 0
      ? `Branches by ${authorPick.map((key) => authors.find(([k]) => k === key)?.[1].name ?? key).join(', ')}`
      : `${value.length} of ${selectable.length} branches`
  const pickAuthors = (keys: string[]): void => {
    if (keys.length === 0) {
      set(selectable.map((ref) => ref.id))
      return
    }
    setAuthorPick(keys)
    setDraft(
      new Set([
        ...pinnedIds,
        ...selectable
          .filter(
            (ref) =>
              ref.category !== 'tags' &&
              !pinned.includes(branchOf(ref)) &&
              keys.includes(authorKey(ref))
          )
          .map((ref) => ref.id)
      ])
    )
  }

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
        {authors.length > 1 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-foreground/80">By author</span>
            {authors.map(([key, { name, count }]) => {
              const on = authorPick.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  title={`${name}'s branches (${count}), with main and development always shown`}
                  className={
                    on
                      ? 'rounded-md border border-ring bg-accent px-1.5 py-0.5'
                      : 'rounded-md border border-border px-1.5 py-0.5 text-foreground/85 hover:text-foreground'
                  }
                  onClick={() =>
                    pickAuthors(on ? authorPick.filter((k) => k !== key) : [...authorPick, key])
                  }
                >
                  {name} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        )}
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
                  setAuthorPick([])
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
              <span className="min-w-0 flex-1 break-all">{ref.name}</span>
              {ref.author && ref.category !== 'tags' && (
                <span className="shrink-0 text-foreground/85">{ref.author}</span>
              )}
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
