// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type {
  GitHistoryItem,
  GitHistoryItemRef,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'

const { getRefs } = vi.hoisted(() => ({ getRefs: vi.fn() }))
vi.mock('@/runtime/source-control/git/runtime-git-status-client', () => ({
  getRuntimeGitRefs: getRefs
}))
vi.mock('@/lib/workspace/ownership/connection-context', () => ({ getConnectionId: () => null }))

const { useGitGraphJump } = await import('./use-git-graph-jump')

const item = (id: string): GitHistoryItem => ({ id, parentIds: [], subject: id, message: id })
const main: GitHistoryItemRef = {
  id: 'refs/heads/main',
  name: 'main',
  category: 'branches',
  revision: 'z'
}
const result = {
  items: [],
  currentRef: { id: 'refs/heads/topic', name: 'topic', category: 'branches', revision: 'a' },
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: true,
  limit: 200
} as GitHistoryResult

type Props = {
  items: GitHistoryItem[]
  hasMore: boolean
  loading: boolean
  allRefs: boolean
}
let api: ReturnType<typeof useGitGraphJump> | undefined
const loadMore = vi.fn()
const setAllRefs = vi.fn()
const reveal = vi.fn()

function Harness(props: Props): null {
  api = useGitGraphJump({
    worktreeId: 'w',
    worktreePath: '/repo',
    ownerTarget: { kind: 'local' },
    result,
    loadMore,
    setAllRefs,
    reveal,
    ...props
  })
  return null
}

const container = document.createElement('div')
const root = createRoot(container)
const render = async (props: Props) => {
  await act(async () => {
    root.render(<Harness {...props} />)
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

it('pages until the branch tip loads, leaving Current branch scope, then reveals it', async () => {
  getRefs.mockResolvedValue([main])
  await render({ items: [item('a')], hasMore: true, loading: false, allRefs: false })
  expect(api!.main?.label).toBe('main')
  await act(async () => api!.jump(api!.main!))
  expect(setAllRefs).toHaveBeenCalledWith(true)
  await render({ items: [item('a')], hasMore: true, loading: false, allRefs: true })
  expect(loadMore).toHaveBeenCalled()
  expect(api!.pending?.label).toBe('main')
  await render({ items: [item('a'), item('z')], hasMore: true, loading: false, allRefs: true })
  expect(reveal).toHaveBeenCalledWith('z')
  expect(api!.pending).toBeNull()
})

it('says so when the history ends without the branch', async () => {
  getRefs.mockResolvedValue([main])
  await render({ items: [item('a')], hasMore: true, loading: false, allRefs: true })
  await act(async () => api!.jump(api!.main!))
  await render({ items: [item('a'), item('b')], hasMore: false, loading: false, allRefs: true })
  expect(reveal).not.toHaveBeenCalled()
  expect(api!.notice).toBe('main is not in this graph')
})

it('reveals a loaded commit at once, and falls back to loaded refs on an old host', async () => {
  getRefs.mockRejectedValue(new Error('unknown method'))
  const tip = { ...item('a'), references: [{ ...main, revision: undefined }] }
  await render({ items: [tip], hasMore: false, loading: false, allRefs: true })
  expect(api!.main?.revision).toBe('a')
  await act(async () => api!.jump(api!.main!))
  expect(reveal).toHaveBeenCalledWith('a')
  expect(loadMore).not.toHaveBeenCalled()
})
