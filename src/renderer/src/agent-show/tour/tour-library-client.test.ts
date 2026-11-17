import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRuntimeRpc = vi.fn()
const target = { current: { kind: 'local' } as { kind: string; environmentId?: string } }

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({
  callRuntimeRpc: (...args: unknown[]) => callRuntimeRpc(...args)
}))
vi.mock('@/runtime/files/workspace-file-host-routing', () => ({
  buildWorkspaceFileContext: () => ({ target: target.current })
}))
vi.mock('@/runtime/rpc/targets/runtime-worktree-selector', () => ({
  toRuntimeWorktreeSelector: (id: string) => `id:${id}`
}))

import { fetchTourSnapshot } from './tour-library-client'

describe('fetchTourSnapshot', () => {
  const writeTourSnapshot = vi.fn(async () => '/tmp/orca-tour-snapshots/abcdef0/a@abcdef0.ts')
  const snapshot = { commit: 'abcdef0', path: 'a.ts', text: 'old' }

  beforeEach(() => {
    callRuntimeRpc.mockReset().mockResolvedValue(snapshot)
    writeTourSnapshot.mockClear()
    vi.stubGlobal('window', { api: { agentShow: { writeTourSnapshot } } })
  })

  it.each([
    ['this computer', { kind: 'local' }],
    ['a box', { kind: 'environment', environmentId: 'devbox' }]
  ])(
    "reads the text on the worktree's host (%s) and opens this computer's copy",
    async (_label, host) => {
      target.current = host
      await expect(fetchTourSnapshot('w', '/repo', 'abcdef0', 'a.ts')).resolves.toBe(
        '/tmp/orca-tour-snapshots/abcdef0/a@abcdef0.ts'
      )
      expect(callRuntimeRpc).toHaveBeenCalledWith(
        host,
        'agentShow.tourSnapshot',
        { worktree: 'id:w', commit: 'abcdef0', path: 'a.ts' },
        expect.anything()
      )
      expect(writeTourSnapshot).toHaveBeenCalledWith(snapshot)
    }
  )
})
