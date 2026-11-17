// Local (glass build): jumping the Git Graph to a branch (Paweł, 2026-11-17: "I also want easy way
// to jump to main and to development"). The repo's branches come from git itself, so a branch
// whose tip is not loaded yet can still be picked: the graph pages on until its tip loads, and
// leaves Current branch scope for All branches when the branch is not on HEAD's history.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { getRuntimeGitRefs } from '@/runtime/source-control/git/runtime-git-status-client'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type {
  GitHistoryItem,
  GitHistoryItemRef,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import { gitGraphBranchName } from './git-graph-lane-names'

/** How far the graph pages looking for a branch before saying it is too far back. */
const MAX_JUMP_COMMITS = 6000

export type GitGraphJumpTarget = {
  /** What the button says: `main`, or `origin/main` for a remote-only trunk. */
  label: string
  revision: string
  ref?: GitHistoryItemRef
}

const MAIN_NAMES = ['main', 'master', 'trunk']
const DEVELOP_NAMES = ['develop', 'development', 'dev']

/** The repo's trunk among its refs: a local branch first, else the same name on a remote. */
export function findGitGraphTrunk(
  refs: readonly GitHistoryItemRef[],
  names: readonly string[]
): GitGraphJumpTarget | undefined {
  for (const name of names) {
    const local = refs.find((ref) => ref.category === 'branches' && ref.name === name)
    if (local?.revision) {
      return { label: name, revision: local.revision, ref: local }
    }
  }
  for (const name of names) {
    const remote =
      refs.find((ref) => ref.category === 'remote branches' && ref.name === `origin/${name}`) ??
      refs.find((ref) => ref.category === 'remote branches' && gitGraphBranchName(ref) === name)
    if (remote?.revision) {
      return { label: remote.name, revision: remote.revision, ref: remote }
    }
  }
  return undefined
}

function refsOfItems(items: readonly GitHistoryItem[]): GitHistoryItemRef[] {
  const refs = new Map<string, GitHistoryItemRef>()
  for (const item of items) {
    for (const ref of item.references ?? []) {
      if (!refs.has(ref.id)) {
        refs.set(ref.id, { ...ref, revision: ref.revision ?? item.id })
      }
    }
  }
  return [...refs.values()]
}

export function useGitGraphJump({
  worktreeId,
  worktreePath,
  ownerTarget,
  result,
  items,
  hasMore,
  loading,
  loadMore,
  allRefs,
  setAllRefs,
  reveal
}: {
  worktreeId: string
  worktreePath: string | null
  ownerTarget: RuntimeClientTarget | null
  result: GitHistoryResult | null
  items: readonly GitHistoryItem[]
  hasMore: boolean
  loading: boolean
  loadMore: () => void
  allRefs: boolean
  setAllRefs: (value: boolean) => void
  reveal: (id: string) => void
}) {
  const [gitRefs, setGitRefs] = useState<GitHistoryItemRef[] | null>(null)
  const historyToken = result?.historyToken
  // Read the branch list again whenever the history reloads (Refresh, a moved HEAD).
  useEffect(() => {
    if (!worktreePath || !ownerTarget) {
      return
    }
    let live = true
    getRuntimeGitRefs({
      target: ownerTarget,
      worktreeId,
      worktreePath,
      connectionId: getConnectionId(worktreeId) ?? undefined
    })
      .then((refs) => live && setGitRefs(refs))
      // A host too old for `git.refs`: the refs on loaded commits stand in.
      .catch(() => live && setGitRefs(null))
    return () => {
      live = false
    }
  }, [historyToken, ownerTarget, worktreeId, worktreePath])

  const refs = useMemo(() => gitRefs ?? refsOfItems(items), [gitRefs, items])
  const head: GitGraphJumpTarget | undefined = result?.currentRef?.revision
    ? {
        label: result.currentRef.name,
        revision: result.currentRef.revision,
        ref: result.currentRef
      }
    : undefined
  const main = useMemo(() => findGitGraphTrunk(refs, MAIN_NAMES), [refs])
  const develop = useMemo(() => findGitGraphTrunk(refs, DEVELOP_NAMES), [refs])

  const [pending, setPending] = useState<GitGraphJumpTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const loaded = useMemo(() => new Set(items.map((item) => item.id)), [items])

  const jump = useCallback(
    (target: GitGraphJumpTarget) => {
      setNotice(null)
      if (loaded.has(target.revision)) {
        reveal(target.revision)
        return
      }
      if (!allRefs && target.revision !== result?.currentRef?.revision) {
        setAllRefs(true)
      }
      setPending(target)
    },
    [allRefs, loaded, result?.currentRef?.revision, reveal, setAllRefs]
  )

  useEffect(() => {
    if (!pending) {
      return
    }
    if (loaded.has(pending.revision)) {
      setPending(null)
      reveal(pending.revision)
      return
    }
    if (loading) {
      return
    }
    if (hasMore && items.length < MAX_JUMP_COMMITS) {
      loadMore()
      return
    }
    setPending(null)
    setNotice(
      hasMore
        ? `${pending.label} is more than ${MAX_JUMP_COMMITS} commits back`
        : `${pending.label} is not in this graph`
    )
  }, [hasMore, items.length, loadMore, loaded, loading, pending, reveal])

  return {
    refs,
    head,
    main,
    develop,
    jump,
    pending,
    notice,
    clearNotice: () => setNotice(null)
  }
}
