// Local (glass build): the branch picker's PR filter (Paweł, 2026-11-27: "option to hide branch
// names that are not target branches nor prs ... branches from slack agents ... neither pushed nor
// prs and they also obscure the view", then "filter to see merged and not merged ... drafts and
// all that too"). Each branch is in one state, read from its pull request: open, draft, merged,
// closed, or no PR at all; the picker shows or hides each state. Branches the view needs always
// stay: main, development and the like, pinned ones, the current one, and every branch a PR
// merges into (a target such as test). Tags stay too. The choice is remembered for every graph.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GitHistoryItem,
  GitHistoryItemRef,
  GitHistoryRefs,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import { GIT_GRAPH_DEFAULT_TRUNKS, gitGraphBranchName } from './git-graph-lane-names'
import {
  gitGraphBranchPullRequest,
  useGitGraphPrNames,
  type GitGraphPullRequests
} from './use-git-graph-pull-requests'
import type { GitGraphDensity } from './git-graph-toolbar'

export type GitGraphBranchState = 'open' | 'draft' | 'merged' | 'closed' | 'none'

export const GIT_GRAPH_BRANCH_STATES: readonly GitGraphBranchState[] = [
  'open',
  'draft',
  'merged',
  'closed',
  'none'
]

export const GIT_GRAPH_BRANCH_STATE_LABELS: Record<GitGraphBranchState, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
  none: 'No PR'
}

const STORAGE_KEY = 'orca.gitGraph.prStates'
/** The history call takes at most this many named refs (validateHistoryRefs). */
const MAX_NAMED_REFS = 1000

function readStates(): GitGraphBranchState[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(stored)) {
      return GIT_GRAPH_BRANCH_STATES.filter((state) => stored.includes(state))
    }
  } catch {
    // Unreadable or blocked storage: every state shows.
  }
  return [...GIT_GRAPH_BRANCH_STATES]
}

/** Which PR states the graph draws; every one until some are turned off. */
export function useGitGraphBranchStates(): [
  GitGraphBranchState[],
  (next: GitGraphBranchState[]) => void
] {
  const [states, setStates] = useState(readStates)
  const choose = useCallback((next: GitGraphBranchState[]) => {
    const ordered = GIT_GRAPH_BRANCH_STATES.filter((state) => next.includes(state))
    setStates(ordered)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered))
    } catch {
      // The choice lasts for this tab only.
    }
  }, [])
  return [states, choose]
}

export type GitGraphBranchStateRule = {
  /** Ref ids the filter keeps, sorted. */
  shown: string[]
  /** Ref ids it hides, with the state that hid them. */
  hidden: Map<string, GitGraphBranchState>
  /** Branches (refs) in each state, kept ones excluded. */
  counts: Record<GitGraphBranchState, number>
}

/** Sorts each branch ref into its PR state and keeps the states asked for. */
export function gitGraphBranchStateRule(
  refs: readonly GitHistoryItemRef[],
  prs: GitGraphPullRequests,
  {
    states,
    trunks,
    headRefId
  }: {
    states: readonly GitGraphBranchState[]
    /** Main, development and the like, and the pinned branches. */
    trunks: readonly string[]
    headRefId?: string
  }
): GitGraphBranchStateRule {
  const targets = new Set(prs.list.map((pr) => pr.baseName).filter((name) => !!name))
  const counts: Record<GitGraphBranchState, number> = {
    open: 0,
    draft: 0,
    merged: 0,
    closed: 0,
    none: 0
  }
  const shown: string[] = []
  const hidden = new Map<string, GitGraphBranchState>()
  for (const ref of refs) {
    if (!ref.revision || ref.name.endsWith('/HEAD')) {
      continue
    }
    const name = gitGraphBranchName(ref)
    if (!name || ref.id === headRefId || trunks.includes(name) || targets.has(name)) {
      shown.push(ref.id)
      continue
    }
    const state: GitGraphBranchState =
      gitGraphBranchPullRequest(prs, name, ref.revision)?.state ?? 'none'
    counts[state] += 1
    if (states.includes(state)) {
      shown.push(ref.id)
    } else {
      hidden.set(ref.id, state)
    }
  }
  return { shown: shown.sort(), hidden, counts }
}

/** The picker's own choice of branches, less the ones the PR filter hides. */
export function narrowGitGraphRefs(
  chosen: GitHistoryRefs,
  shown: readonly string[]
): GitHistoryRefs {
  if (chosen === 'head') {
    return chosen
  }
  if (chosen === 'all') {
    return shown.length > MAX_NAMED_REFS ? 'all' : [...shown]
  }
  const keep = new Set(shown)
  const narrowed = chosen.filter((id) => keep.has(id))
  return narrowed.length > 0 ? narrowed : [...shown]
}

/**
 * The PR filter's verdict for the graph: once every PR page it needs has loaded, the refs to draw
 * (null while it hides nothing); the last verdict stays while the PRs reload after the graph
 * redraws, so the graph does not flick back to every branch and out again.
 */
export function useGitGraphBranchStateFilter({
  states,
  refs,
  prs,
  trunks,
  headRefId,
  onRefs
}: {
  states: readonly GitGraphBranchState[]
  refs: readonly GitHistoryItemRef[]
  prs: GitGraphPullRequests
  trunks: readonly string[]
  headRefId?: string
  onRefs: (shown: string[] | null) => void
}): GitGraphBranchStateRule {
  const rule = useMemo(
    () => gitGraphBranchStateRule(refs, prs, { states, trunks, headRefId }),
    [headRefId, prs, refs, states, trunks]
  )
  const active = states.length < GIT_GRAPH_BRANCH_STATES.length
  const lastKey = useRef<string | null>(null)
  // A failed PR list cannot tell states apart: draw every branch rather than only the kept ones.
  const ready = prs.settled && !prs.error && refs.length > 0
  useEffect(() => {
    // Hiding nothing draws every branch, unless a list is already drawn: on a host too old for
    // `git.refs` the refs come from the drawn commits, so the hidden ones vanish from them, and
    // dropping the list would draw them again and hide them again, round and round.
    const next =
      !active || prs.error
        ? null
        : !ready
          ? undefined
          : rule.hidden.size === 0 && lastKey.current === null
            ? null
            : rule.shown
    if (next === undefined) {
      return
    }
    const key = next ? next.join('\n') : null
    if (key !== lastKey.current) {
      lastKey.current = key
      onRefs(next)
    }
  }, [active, onRefs, prs.error, ready, rule.hidden.size, rule.shown])
  return rule
}

/** The filter's states and the refs the graph's history draws (the picker's pick, narrowed). */
export function useGitGraphPrFilterRefs(refsFilter: GitHistoryRefs): {
  states: GitGraphBranchState[]
  setStates: (next: GitGraphBranchState[]) => void
  setPrRefs: (shown: string[] | null) => void
  historyRefs: GitHistoryRefs
  /** The filter is narrowing the graph now. */
  active: boolean
} {
  const [states, setStates] = useGitGraphBranchStates()
  const [prRefs, setPrRefs] = useState<string[] | null>(null)
  const historyRefs = prRefs ? narrowGitGraphRefs(refsFilter, prRefs) : refsFilter
  return { states, setStates, setPrRefs, historyRefs, active: prRefs !== null }
}

/**
 * The drawn commits without the names of branches the filter hides: a hidden branch that sits on
 * a commit of a branch still drawn (a local branch made at test's tip) would name it otherwise.
 */
export function gitGraphItemsWithoutRefs(
  items: readonly GitHistoryItem[],
  hidden: ReadonlyMap<string, unknown> | null
): readonly GitHistoryItem[] {
  if (!hidden || hidden.size === 0) {
    return items
  }
  return items.map((item) =>
    item.references?.some((ref) => hidden.has(ref.id))
      ? { ...item, references: item.references.filter((ref) => !hidden.has(ref.id)) }
      : item
  )
}

export function useGitGraphVisibleItems(
  items: readonly GitHistoryItem[],
  hidden: ReadonlyMap<string, unknown> | null
): GitHistoryItem[] {
  return useMemo(() => gitGraphItemsWithoutRefs(items, hidden) as GitHistoryItem[], [hidden, items])
}

/** The repo's PRs (names, colours, descriptions) and the filter's verdict on its branches. */
export function useGitGraphPullRequestsAndFilter({
  density,
  repoId,
  items,
  pinned,
  result,
  refs,
  states,
  active,
  onRefs
}: {
  density: GitGraphDensity
  repoId: string | null
  items: readonly GitHistoryItem[]
  pinned: readonly string[]
  result: GitHistoryResult | null
  refs: readonly GitHistoryItemRef[]
  states: readonly GitGraphBranchState[]
  /** The filter narrows the graph now (useGitGraphPrFilterRefs). */
  active: boolean
  onRefs: (shown: string[] | null) => void
}): {
  prNames: ReturnType<typeof useGitGraphPrNames>
  stateRule: GitGraphBranchStateRule
  /** The drawn commits, without the names of the branches the filter hides. */
  items: GitHistoryItem[]
} {
  const prNames = useGitGraphPrNames(
    density,
    repoId,
    items,
    pinned,
    result,
    states.length < GIT_GRAPH_BRANCH_STATES.length
  )
  const trunks = useMemo(() => [...pinned, ...GIT_GRAPH_DEFAULT_TRUNKS], [pinned])
  const stateRule = useGitGraphBranchStateFilter({
    states,
    refs,
    prs: prNames.pullRequests,
    trunks,
    headRefId: result?.currentRef?.id,
    onRefs
  })
  const visible = useGitGraphVisibleItems(items, active ? stateRule.hidden : null)
  return { prNames, stateRule, items: visible }
}
