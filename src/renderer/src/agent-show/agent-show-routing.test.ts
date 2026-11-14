import { describe, expect, it, vi } from 'vitest'
import type {
  AgentShowContext,
  AgentShowRequest,
  AgentShowResult
} from '../../../shared/agent-show/agent-show-contract'
import { createAgentShowDispatcher, type AgentShowAreas } from './agent-show-routing'

const shown = (detail: string): Promise<AgentShowResult> =>
  Promise.resolve({ ok: true, visible: true, detail })

function fakeAreas() {
  return {
    code: vi.fn(() => shown('code')),
    file: vi.fn(() => shown('file')),
    tree: vi.fn(() => shown('tree')),
    ui: vi.fn(() => shown('ui')),
    state: vi.fn(() => shown('state')),
    clearCode: vi.fn(),
    clearTree: vi.fn(),
    clearUi: vi.fn(),
    revealWorktree: vi.fn()
  } satisfies AgentShowAreas
}

const context = (focus: boolean): AgentShowContext => ({
  worktreeId: 'wt-1',
  worktreePath: '/repo',
  ownerTabId: 'tab-1',
  focus
})

describe('createAgentShowDispatcher', () => {
  it('routes each kind to its own area and focuses the worktree first', async () => {
    const areas = fakeAreas()
    const dispatch = createAgentShowDispatcher(areas)
    const request: AgentShowRequest = {
      kind: 'tree',
      entries: [{ path: 'src' }],
      expand: true,
      dimOthers: false
    }

    await expect(dispatch(request, context(true))).resolves.toEqual({
      ok: true,
      visible: true,
      detail: 'tree'
    })
    expect(areas.tree).toHaveBeenCalledWith(request, context(true))
    expect(areas.revealWorktree).toHaveBeenCalledWith('wt-1')
    expect(areas.code).not.toHaveBeenCalled()
  })

  it('leaves the view alone with --no-focus, and for state', async () => {
    const areas = fakeAreas()
    const dispatch = createAgentShowDispatcher(areas)
    await dispatch(
      { kind: 'file', filePath: 'a.ts', preview: false, place: 'beside' },
      context(false)
    )
    await dispatch({ kind: 'state' }, context(true))
    expect(areas.file).toHaveBeenCalledOnce()
    expect(areas.state).toHaveBeenCalledOnce()
    expect(areas.revealWorktree).not.toHaveBeenCalled()
  })

  it('fans clear all out to every area, and one scope to that area only', async () => {
    const areas = fakeAreas()
    const dispatch = createAgentShowDispatcher(areas)

    await dispatch({ kind: 'clear', scope: 'all' }, context(true))
    expect(areas.clearCode).toHaveBeenCalledWith(context(true))
    expect(areas.clearTree).toHaveBeenCalledWith(context(true))
    expect(areas.clearUi).toHaveBeenCalledWith(context(true))

    const scoped = fakeAreas()
    await createAgentShowDispatcher(scoped)({ kind: 'clear', scope: 'ui' }, context(true))
    expect(scoped.clearUi).toHaveBeenCalledOnce()
    expect(scoped.clearCode).not.toHaveBeenCalled()
    expect(scoped.clearTree).not.toHaveBeenCalled()
    expect(scoped.revealWorktree).not.toHaveBeenCalled()
  })

  it('answers with show_failed when an area throws', async () => {
    const areas = fakeAreas()
    areas.ui.mockRejectedValueOnce(new Error('page gone'))
    const result = await createAgentShowDispatcher(areas)(
      { kind: 'ui', target: { text: 'Sign in' } },
      context(false)
    )
    expect(result).toEqual({ ok: false, code: 'show_failed', message: 'page gone' })
  })
})
