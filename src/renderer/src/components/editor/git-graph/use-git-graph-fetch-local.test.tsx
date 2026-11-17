// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

const { fetchGit } = vi.hoisted(() => ({ fetchGit: vi.fn() }))
vi.mock('@/runtime/source-control/git/runtime-git-sync-client', () => ({
  fetchRuntimeGit: fetchGit
}))
vi.mock('@/lib/workspace/ownership/connection-context', () => ({ getConnectionId: () => null }))
const { useGitGraphFetch } = await import('./use-git-graph-fetch')

let api: ReturnType<typeof useGitGraphFetch> | undefined
const onFetched = vi.fn()
function Harness(): null {
  api = useGitGraphFetch({
    worktreeId: 'w',
    worktreePath: '/repo',
    ownerTarget: { kind: 'local' },
    onFetched
  })
  return null
}

it('fetches, then reloads the graph; a failure shows its message', async () => {
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Harness />))
  fetchGit.mockResolvedValueOnce(undefined)
  await act(async () => api!.fetch())
  expect(fetchGit).toHaveBeenCalledWith(
    expect.objectContaining({ worktreeId: 'w', worktreePath: '/repo' })
  )
  expect(onFetched).toHaveBeenCalledTimes(1)
  expect(api!.fetching).toBe(false)
  fetchGit.mockRejectedValueOnce(new Error('could not read from remote'))
  await act(async () => api!.fetch())
  expect(api!.error).toBe('could not read from remote')
  expect(onFetched).toHaveBeenCalledTimes(1)
})
