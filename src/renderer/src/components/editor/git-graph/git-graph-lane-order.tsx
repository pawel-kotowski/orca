// Local (glass build): the Git Graph toolbar's "Left lanes" menu. The branches listed here sit
// leftmost, in this order, in their own fixed colours; every other branch follows. Kept per
// project; Reset goes back to main then development.
import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Columns3, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'

export function GitGraphLaneOrder({
  pinned,
  custom,
  branches,
  colourOf,
  onChange,
  onReset
}: {
  pinned: string[]
  custom: boolean
  /** Every branch name in the repo, for adding one. */
  branches: string[]
  colourOf: (name: string) => GitHistoryGraphColorId
  onChange: (names: string[]) => void
  onReset: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? branches
          .filter((name) => !pinned.includes(name) && name.toLowerCase().includes(needle))
          .slice(0, 8)
      : []
  }, [branches, pinned, query])
  const move = (index: number, step: -1 | 1): void => {
    const next = [...pinned]
    const [name] = next.splice(index, 1)
    next.splice(index + step, 0, name!)
    onChange(next)
  }
  const add = (name: string): void => {
    onChange([...pinned, name])
    setQuery('')
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="max-w-[24rem] gap-1 text-foreground/85"
          title="Branches pinned to the left of the graph, in order"
        >
          <Columns3 className="size-3.5 shrink-0" />
          <span className="truncate">Left: {pinned.length ? pinned.join(' › ') : 'none'}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2 text-xs">
        <p className="mb-2 text-muted-foreground">
          These branches sit leftmost, in this order, each in its own colour. Every other branch
          follows. Saved for this project.
        </p>
        {pinned.map((name, index) => (
          <div
            key={name}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/50"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: graphColor(colourOf(name)) }}
            />
            <span className="min-w-0 flex-1 break-all">{name}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${name} left`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Move ${name} right`}
              disabled={index === pinned.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Unpin ${name}`}
              onClick={() => onChange(pinned.filter((other) => other !== name))}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event) && matches[0]) {
              event.preventDefault()
              add(matches[0])
            }
          }}
          placeholder="Pin another branch…"
          className="mt-2 h-7 w-full rounded-md border border-border bg-transparent px-2 outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        {matches.map((name) => (
          <button
            key={name}
            type="button"
            className="block w-full rounded px-2 py-1 text-left break-all hover:bg-accent"
            onClick={() => add(name)}
          >
            {name}
          </button>
        ))}
        {custom && (
          <Button variant="ghost" size="xs" className="mt-2" onClick={onReset}>
            Reset to main, then development
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
