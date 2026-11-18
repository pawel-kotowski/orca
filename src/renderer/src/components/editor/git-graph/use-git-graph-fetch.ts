// Local (glass build): Fetch in the Git Graph toolbar (Paweł, 2026-11-17: "add git fetch option").
// Orca's own fetch (`git fetch --prune` on the remote, on whichever machine owns the workspace),
// then the graph loads again so new remote branches and commits show.
import { useCallback, useState } from 'react'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { fetchRuntimeGit } from '@/runtime/source-control/git/runtime-git-sync-client'
import type { RuntimeClientTarget } from '../../../../../shared/remote-runtime/host-catalog/runtime-client-target'

export function useGitGraphFetch({
  worktreeId,
  worktreePath,
  ownerTarget,
  onFetched
}: {
  worktreeId: string
  worktreePath: string | null
  ownerTarget: RuntimeClientTarget | null
  onFetched: () => void
}): { fetching: boolean; error: string | null; fetch: () => void; clearError: () => void } {
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetch = useCallback(() => {
    if (!worktreePath || !ownerTarget || fetching) {
      return
    }
    setFetching(true)
    setError(null)
    fetchRuntimeGit({
      target: ownerTarget,
      worktreeId,
      worktreePath,
      connectionId: getConnectionId(worktreeId) ?? undefined
    })
      .then(onFetched)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setFetching(false))
  }, [fetching, onFetched, ownerTarget, worktreeId, worktreePath])
  return { fetching, error, fetch, clearError: useCallback(() => setError(null), []) }
}
