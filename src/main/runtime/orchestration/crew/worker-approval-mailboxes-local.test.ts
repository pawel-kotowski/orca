import { describe, expect, it } from 'vitest'
import { fixture } from './crew-read-model.test-fixture'
import { buildCrewSnapshot } from './crew-party-snapshot'
import { readCrewApprovals } from './crew-query'
import { subscribeWorkerApprovals } from './worker-approval-stream'
import { workerApprovalMailboxes } from './worker-approval-mailboxes'
import { approvalReportId } from '../workers/approvals/worker-approval-report'
import { WorkerApprovalsSubscribeParams } from '../../../../shared/orchestration/orchestration-crew'
import type { OrchestrationWorkerApprovalsFrame } from '../../../../shared/orchestration/orchestration-crew'

const SESSION = 'orca_session_id:0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

describe('WorkerApprovalsSubscribeParams', () => {
  it('takes a structured chat by its Orca session and a terminal chat by its handle', () => {
    expect(WorkerApprovalsSubscribeParams.safeParse({ party: SESSION }).success).toBe(true)
    expect(WorkerApprovalsSubscribeParams.safeParse({ party: 'term_abc-1' }).success).toBe(true)
  })

  it('refuses a Run, a Dispatch or anything that is not a party', () => {
    for (const party of ['run:r1', 'dispatch:d1', 'term_', 'orca_session_id:nope', 'pty-1']) {
      expect(WorkerApprovalsSubscribeParams.safeParse({ party }).success).toBe(false)
    }
  })
})

describe('workerApprovalMailboxes', () => {
  it("names a terminal coordinator's handle and the Runs it coordinates", () => {
    const { db, run, handles } = fixture()
    const panes = (handle: string) => handles.get(handle) ?? null
    expect(workerApprovalMailboxes(db, 'term_coord', panes)).toEqual([
      'term_coord',
      `run:${run.id}`
    ])
    // A terminal that coordinates nothing has only its own mailbox.
    expect(workerApprovalMailboxes(db, 'term_peer', panes)).toEqual(['term_peer'])
  })

  it("keeps a Run bound to the coordinator's pane after its terminal got a new handle", () => {
    const { db, run, handles } = fixture()
    const pane = handles.get('term_coord')!
    expect(workerApprovalMailboxes(db, 'term_coord2', () => pane)).toContain(`run:${run.id}`)
  })

  it('reads a structured chat by its session, and nothing for any other address', () => {
    const { db } = fixture()
    expect(workerApprovalMailboxes(db, SESSION, () => null)).toEqual([SESSION])
    expect(workerApprovalMailboxes(db, 'run:r1', () => null)).toEqual([])
  })

  it("streams a terminal coordinator's worker approval with its worker", () => {
    const { db, deps, run, assign, handles } = fixture()
    const dispatch = assign('term_worker')
    db.insertMessage({
      id: approvalReportId(dispatch.id, 'apr_1', 'open'),
      from: 'term_worker',
      to: `run:${run.id}`,
      subject: 'apr_1',
      type: 'escalation',
      runId: run.id,
      payload: JSON.stringify({
        approval: {
          v: 1,
          approvalId: 'apr_1',
          state: 'open',
          worker: { handle: 'term_worker', dispatchId: dispatch.id, taskId: dispatch.task_id },
          summary: { title: 'Allow Bash?', detail: null, reason: null },
          allowedActions: ['allow', 'deny']
        }
      })
    })
    const frames: OrchestrationWorkerApprovalsFrame[] = []
    const stop = subscribeWorkerApprovals(
      {
        mailboxes: () =>
          workerApprovalMailboxes(db, 'term_coord', (handle) => handles.get(handle) ?? null),
        approvals: (mailboxes) => readCrewApprovals(db, mailboxes),
        workers: () => buildCrewSnapshot('term_coord', deps).sections.managing,
        watch: () => () => {}
      },
      (frame) => frames.push(frame)
    )
    stop()
    const entries = frames.flatMap((frame) => (frame.type === 'approval' ? [frame.entry] : []))
    expect(entries.map(({ approval, worker }) => [approval.approvalId, worker.role])).toEqual([
      ['apr_1', 'worker']
    ])
  })
})
