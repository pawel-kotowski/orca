import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDatabase from '../../../../sqlite/sync-database'
import { OrchestrationDb } from '../orchestration-db'
import { repairForkStampedSchemaVersion } from './fork-schema-version-repair'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** Turn a current database back into what the fork's own v44 build left on disk. */
function forkStampedV44(path: string): void {
  new OrchestrationDb(path).close()
  const raw = new SyncDatabase(path)
  raw.exec(`
    DROP INDEX IF EXISTS idx_worker_terminal_resources_auto_release;
    DROP INDEX IF EXISTS idx_federated_dispatches_home_auto_release;
    DROP INDEX IF EXISTS idx_dispatch_contexts_follow_up_of;
    ALTER TABLE worker_terminal_resources DROP COLUMN auto_release_at;
    ALTER TABLE worker_terminal_resources DROP COLUMN auto_release_dispatch_id;
    ALTER TABLE worker_terminal_resources DROP COLUMN resume_session;
    ALTER TABLE federated_dispatches DROP COLUMN home_auto_release_at;
    ALTER TABLE federated_dispatches DROP COLUMN home_auto_release_state;
    ALTER TABLE dispatch_contexts DROP COLUMN follow_up_of_dispatch_id;
    ALTER TABLE dispatch_contexts DROP COLUMN follow_up_mail_at;
    ALTER TABLE messages ADD COLUMN pointer_delivery TEXT NOT NULL DEFAULT 'queue'
      CHECK(pointer_delivery IN ('queue', 'now'));
    DROP TRIGGER IF EXISTS trg_deliveries_one_outstanding;
  `)
  // Since v41 a mailbox may hold several outstanding batches; replaying v34 would refuse them.
  for (const id of ['d1', 'd2']) {
    raw
      .prepare(
        `INSERT INTO deliveries (id, run_id, mailbox_handle, consumer_generation, message_ids)
         VALUES (?, 'run_1', 'dispatch:ctx_1', 0, '[]')`
      )
      .run(id)
  }
  raw.pragma('user_version = 44')
  raw.close()
}

function columns(path: string, table: string): string[] {
  const raw = new SyncDatabase(path)
  const names = (raw.pragma(`table_info(${table})`) as { name: string }[]).map((row) => row.name)
  raw.close()
  return names
}

describe('fork-stamped schema version repair', () => {
  it('reads a database the fork stamped v44 as v43 and runs upstream v44 onward', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fork-v44-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    forkStampedV44(path)

    const raw = new SyncDatabase(path)
    expect(repairForkStampedSchemaVersion(raw, 44)).toBe(43)
    raw.close()

    new OrchestrationDb(path).close()

    const reopened = new SyncDatabase(path)
    expect(reopened.pragma('user_version', { simple: true })).toBe(46)
    reopened.close()
    expect(columns(path, 'worker_terminal_resources')).toContain('auto_release_at')
    expect(columns(path, 'dispatch_contexts')).toContain('follow_up_of_dispatch_id')
  })

  it('leaves an upstream v44 database alone', () => {
    const directory = mkdtempSync(join(tmpdir(), 'upstream-v44-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    new OrchestrationDb(path).close()
    const raw = new SyncDatabase(path)
    expect(repairForkStampedSchemaVersion(raw, 44)).toBe(44)
    expect(repairForkStampedSchemaVersion(raw, 46)).toBe(46)
    raw.close()
  })
})
