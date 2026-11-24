import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ host: null as object | null }))
vi.mock('../../native-chat/agent-session-wire/host/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => mocks.host
}))

import { claudeAllowsIdleCompaction } from './idle-compaction-install'
import { structuredIdleCompactionTarget } from './idle-compaction-structured-chat'

const ID = 'ce489453-5f6c-4b04-bd51-b00646a38a10'
const CHAT = { sessionId: 'chat', providerSessionId: ID }
let root = ''
const launchAccountHome = vi.fn()

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'idle-compaction-'))
  await mkdir(join(root, 'system/projects/-repo'), { recursive: true })
  await writeFile(join(root, 'system/projects/-repo', `${ID}.jsonl`), '{}\n')
  for (const account of ['founding', 'selected']) {
    await mkdir(join(root, account))
    await symlink(join(root, 'system/projects'), join(root, account, 'projects'))
  }
  launchAccountHome.mockReset().mockResolvedValue(home('selected'))
  mocks.host = {
    deps: {
      launchAccountHome,
      store: {
        getRecord: () => ({
          provider: 'claude',
          location: { wslDistro: null },
          accountHome: home('founding')
        })
      }
    }
  }
})
afterEach(() => rm(root, { recursive: true, force: true }))

const home = (name: string) => ({ variable: 'CLAUDE_CONFIG_DIR', path: join(root, name) })
async function allowed(): Promise<boolean> {
  const { transcriptPath, configDir } = await structuredIdleCompactionTarget(() => null).source(
    'claude',
    CHAT
  )
  return claudeAllowsIdleCompaction(transcriptPath!, configDir)
}

it("reads Claude's switches from the account a start of the chat would run under", async () => {
  expect(await allowed()).toBe(true)
  await writeFile(join(root, 'system/settings.json'), '{"idleCompaction":false}')
  await writeFile(join(root, 'founding/settings.json'), '{"idleCompaction":false}')
  expect(await allowed()).toBe(true)
  await writeFile(join(root, 'selected/settings.json'), '{"idleCompaction":false}')
  expect(await allowed()).toBe(false)
  await writeFile(join(root, 'selected/settings.json'), '{}')
  await writeFile(join(root, 'selected/.claude.json'), '{"autoCompactEnabled":false}')
  expect(await allowed()).toBe(false)
})

it('reads them from the founding account where the chat keeps it', async () => {
  launchAccountHome.mockResolvedValue(null)
  await writeFile(join(root, 'founding/settings.json'), '{"idleCompaction":false}')
  expect(await allowed()).toBe(false)
})

it("finds no transcript outside that account's folder", async () => {
  launchAccountHome.mockResolvedValue(home('gone'))
  expect(await structuredIdleCompactionTarget(() => null).source('claude', CHAT)).toEqual({
    transcriptPath: null,
    configDir: join(root, 'gone')
  })
})
