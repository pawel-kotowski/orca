import { beforeEach, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'

const login = vi.hoisted(() => vi.fn())
vi.mock('../../claude-accounts/session-login/claude-session-login-read', () => ({
  readClaudeFolderSessionLogin: login
}))

import { idleCompactionLimitSpent } from './idle-compaction-account-limit'

const home = (path: string) => ({ variable: 'CLAUDE_CONFIG_DIR', path })
const chat = (sessionId: string, path: string, more: object = {}) =>
  ({
    sessionId,
    provider: 'claude',
    location: { wslDistro: null },
    accountHome: home(path),
    ...more
  }) as unknown as AgentSessionRecord
const spent = (usedPercent: number, resetsAt: number | null = Date.now() + 60_000) => ({
  session: { usedPercent, windowMinutes: 300, resetsAt },
  weekly: null,
  status: 'ok'
})

const accountUsage = vi.fn()
const fetchInactive = vi.fn(async () => {})
const RECORD = chat('chat', '/b')
let others: AgentSessionRecord[] = []
let cuts: Record<string, number | undefined> = {}
let inactive: object[] = []

const isSpent = () =>
  idleCompactionLimitSpent(
    {
      deps: {
        usageLimitAutoContinue: { accountUsage },
        store: { getRecord: (id: string) => others.find(({ sessionId }) => sessionId === id) }
      },
      loadedSessionIds: () => ['chat', ...others.map(({ sessionId }) => sessionId)],
      readUsageLimitCut: async (id: string) => (id in cuts ? { resetsAt: cuts[id] } : null)
    } as never,
    RECORD,
    {
      fetchInactiveClaudeAccountsOnOpen: fetchInactive,
      getState: async () => ({ inactiveClaudeAccounts: inactive })
    } as never
  )

beforeEach(() => {
  others = []
  cuts = {}
  inactive = []
  accountUsage.mockReset().mockResolvedValue({ scope: 's' })
  login.mockReset().mockResolvedValue({ accountId: 'b', limits: null })
})

it("reads the polled account's usage where the chat runs on it", async () => {
  accountUsage.mockResolvedValue({ account: { read: () => spent(100) } })
  expect(await isSpent()).toBe(true)
  expect(login).not.toHaveBeenCalled()
  accountUsage.mockResolvedValue({ account: { read: () => spent(40) } })
  expect(await isSpent()).toBe(false)
})

it("a workspace's own account, which Orca does not poll, is read for it", async () => {
  expect(await isSpent()).toBe(false)
  inactive = [
    { accountId: 'a', rateLimits: spent(0) },
    { accountId: 'b', rateLimits: spent(100) }
  ]
  expect(await isSpent()).toBe(true)
  expect(fetchInactive).toHaveBeenCalled()
  // A login folder Orca does not manage.
  login.mockResolvedValue({ accountId: null, limits: spent(100) })
  expect(await isSpent()).toBe(true)
})

it('another chat cut off on the same account says so too, until its reset', async () => {
  others = [chat('other', '/b')]
  cuts = { other: Date.now() + 60_000 }
  expect(await isSpent()).toBe(true)
  cuts = { other: Date.now() - 1 }
  expect(await isSpent()).toBe(false)
  cuts = { other: Date.now() + 60_000 }
  others = [chat('other', '/b', { launchedAccount: { fence: 1, accountHome: home('/a') } })]
  expect(await isSpent()).toBe(false)
})
