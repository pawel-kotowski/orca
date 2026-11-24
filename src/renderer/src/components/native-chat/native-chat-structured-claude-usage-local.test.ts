import { expect, it } from 'vitest'
import type { AgentSessionClaudeAccount } from '../../../../shared/agent-session/lifecycle/accounts/agent-session-claude-account'
import { structuredClaudeUsage } from './native-chat-structured-claude-usage'

const login = (configDir: string, accountId: string | null, email: string | null) => ({
  configDir,
  accountId,
  email,
  organizationName: null,
  limits: null
})
const account = (
  running: ReturnType<typeof login> | null,
  next: ReturnType<typeof login>
): AgentSessionClaudeAccount => ({
  status: 'ok',
  running,
  next,
  choices: [{ accountId: 'a', email: 'p@a.test' }]
})

it('shows the running agent and where its next start moves', () => {
  const usage = structuredClaudeUsage(
    account(login('/a', 'a', 'p@a.test'), login('/b', 'b', 'p@b.test'))
  )
  expect(usage?.shown.accountId).toBe('a')
  expect(usage?.movingTo?.accountId).toBe('b')
})

it('shows the next start alone when no agent runs or it runs there already', () => {
  const next = login('/home/.claude', 'a', null)
  for (const running of [null, login('/home/.claude', null, null)]) {
    const usage = structuredClaudeUsage(account(running, next))
    expect(usage?.shown).toMatchObject({ accountId: 'a', email: 'p@a.test' })
    expect(usage?.movingTo).toBeNull()
  }
})

it('says nothing for a host or chat that names no account', () => {
  expect(structuredClaudeUsage(null)).toBeNull()
  expect(structuredClaudeUsage({ status: 'unsupported' })).toBeNull()
})
