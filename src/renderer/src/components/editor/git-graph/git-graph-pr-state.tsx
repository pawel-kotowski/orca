// Local (glass build): a pull request's state on a Git Graph name, in Orca's PR colours (Paweł,
// 2026-11-27: "a great way to see merged and not merged prs/branches because we squash merge and i
// dont see it at first glance ... color highlight of pr name seems reasonable"). A squash-merged
// branch never joins its target's line, so the graph's shape cannot say it landed: its name does,
// in purple with the merge icon; open is green, draft slate, closed rose, as in Orca's PR pages
// (review-state-presentation.ts). The text takes the colour and no chip gets a fill (Paweł,
// 2026-11-17: "no background for branch badge! only dot"); the icon says the state without colour.
import React from 'react'
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/class-names'
import type { GitGraphPullRequest } from './use-git-graph-pull-requests'

type PrState = GitGraphPullRequest['state']

const ICONS: Record<PrState, LucideIcon> = {
  open: GitPullRequest,
  draft: GitPullRequestDraft,
  merged: GitMerge,
  closed: GitPullRequestClosed
}

const TEXT: Record<PrState, string> = {
  open: 'text-emerald-600 dark:text-emerald-300',
  draft: 'text-slate-500 dark:text-slate-400',
  merged: 'text-purple-600 dark:text-purple-300',
  closed: 'text-rose-600 dark:text-rose-300'
}

const WORDS: Record<PrState, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed'
}

/** The text colour of a name whose pull request is in this state. */
export function gitGraphPrStateText(state: PrState): string {
  return TEXT[state]
}

export function gitGraphPrStateWord(state: PrState): string {
  return WORDS[state]
}

export function GitGraphPrStateIcon({
  state,
  className
}: {
  state: PrState
  className?: string
}): React.JSX.Element {
  const Icon = ICONS[state]
  return (
    <Icon
      aria-label={`${WORDS[state]} pull request`}
      className={cn('size-3 shrink-0', TEXT[state], className)}
    />
  )
}
