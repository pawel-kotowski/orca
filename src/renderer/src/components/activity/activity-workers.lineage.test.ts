import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { AgentPaneThread } from './activity-thread-types'
import { activityWorkerPlacement, buildActivityWorkers } from './activity-workers'

function thread(paneKey: string, worktreeId: string, handle: string, at = 1): AgentPaneThread {
  const entry = { terminalHandle: handle }
  return {
    paneKey,
    worktree: { id: worktreeId },
    currentAgentEntry: entry,
    currentAgentState: 'working',
    latestEvent: null,
    events: [],
    latestTimestamp: at
  } as unknown as AgentPaneThread
}

function lineage(child: string, parent: string, extra: Partial<WorktreeLineage>): WorktreeLineage {
  return {
    worktreeId: child,
    worktreeInstanceId: 'i-child',
    parentWorktreeId: parent,
    parentWorktreeInstanceId: 'i-parent',
    origin: 'orchestration',
    capture: { source: 'orchestration-context', confidence: 'inferred' },
    createdAt: 1,
    ...extra
  }
}

describe('activity workers from workspace lineage', () => {
  const coordinator = thread('coord', 'repo::wolfeel', 'term_coord', 5)
  const other = thread('other', 'repo::wolfeel', 'term_other', 2)
  const worker = thread('worker', 'repo::prompt-tuning', 'term_worker', 9)

  it('nests a worker of an orchestration workspace under the newest agent of its parent', () => {
    const workers = buildActivityWorkers([coordinator, other, worker], {
      'repo::prompt-tuning': lineage('repo::prompt-tuning', 'repo::wolfeel', {})
    })
    expect(workers.parentByWorker.get('worker')?.paneKey).toBe('coord')
    expect(activityWorkerPlacement(worker, workers, false)).toBe('nested')
    expect(activityWorkerPlacement(worker, workers, true)).toBe('card')
    expect(activityWorkerPlacement(coordinator, workers, false)).toBe('card')
  })

  it('nests a worker whose workspace an agent made with the CLI', () => {
    const workers = buildActivityWorkers([coordinator, worker], {
      'repo::prompt-tuning': lineage('repo::prompt-tuning', 'repo::wolfeel', {
        origin: 'cli',
        capture: { source: 'explicit-cli-flag', confidence: 'explicit' }
      })
    })
    expect(workers.parentByWorker.get('worker')?.paneKey).toBe('coord')
  })

  it('prefers the terminal the lineage names', () => {
    const workers = buildActivityWorkers([coordinator, other, worker], {
      'repo::prompt-tuning': lineage('repo::prompt-tuning', 'repo::wolfeel', {
        coordinatorHandle: 'term_other'
      })
    })
    expect(workers.parentByWorker.get('worker')?.paneKey).toBe('other')
  })

  it('leaves a hand-made child workspace as its own card', () => {
    const workers = buildActivityWorkers([coordinator, worker], {
      'repo::prompt-tuning': lineage('repo::prompt-tuning', 'repo::wolfeel', {
        origin: 'manual',
        capture: { source: 'manual-action', confidence: 'explicit' }
      })
    })
    expect(workers.parentByWorker.size).toBe(0)
    expect(activityWorkerPlacement(worker, workers, false)).toBe('card')
  })
})
