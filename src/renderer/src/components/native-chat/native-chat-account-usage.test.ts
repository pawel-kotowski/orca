import { describe, expect, it } from 'vitest'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import {
  accountIdFromTranscriptPath,
  accountShortName,
  resolveChatClaudeAccount,
  resolveRemoteChatClaudeUsage
} from './native-chat-account-usage'
import type { ProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'

const MOS = '4ea0da2c-7860-4172-bd43-9d2a1177c907'
const ROBO = 'e6945bb8-13b2-463f-abda-c22153bef8ff'
const account = (id: string, email: string): ClaudeManagedAccount => ({
  id,
  email,
  managedAuthPath: `/x/claude-profiles/${id}`,
  managedAuthRuntime: 'host',
  authMethod: 'subscription-oauth',
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0
})
const accounts = [account(MOS, 'a@moshealth.com'), account(ROBO, 'a@robotec.ai')]

describe('native chat account usage', () => {
  it('reads the managed account from the transcript home', () => {
    expect(
      accountIdFromTranscriptPath(
        `/Users/p/Library/Application Support/orca/claude-profiles/${MOS}/home/projects/x/s.jsonl`
      )
    ).toBe(MOS)
    expect(accountIdFromTranscriptPath('/Users/p/.claude/projects/x/s.jsonl')).toBeNull()
    expect(accountIdFromTranscriptPath(null)).toBeNull()
  })

  it('names a subscription by its domain, and a public mailbox as personal', () => {
    expect(accountShortName('pawel@moshealth.com')).toBe('moshealth')
    expect(accountShortName('pawel@robotec.ai')).toBe('robotec')
    expect(accountShortName('someone@gmail.com')).toBe('personal')
  })

  it('prefers the transcript, then the workspace account, then the active one', () => {
    const base = { accounts, accountByWorktreeId: { wt: MOS }, activeAccountId: ROBO }
    expect(
      resolveChatClaudeAccount({
        ...base,
        transcriptPath: `/o/claude-profiles/${ROBO}/home/p.jsonl`,
        worktreeId: 'wt'
      })?.id
    ).toBe(ROBO)
    expect(resolveChatClaudeAccount({ ...base, transcriptPath: null, worktreeId: 'wt' })?.id).toBe(
      MOS
    )
    expect(
      resolveChatClaudeAccount({ ...base, transcriptPath: null, worktreeId: 'other' })?.id
    ).toBe(ROBO)
  })

  it('names no account for a system-home transcript when no managed account is active', () => {
    expect(
      resolveChatClaudeAccount({
        accounts,
        accountByWorktreeId: undefined,
        activeAccountId: null,
        transcriptPath: '/Users/p/.claude/projects/x/s.jsonl',
        worktreeId: null
      })
    ).toBeNull()
  })

  it("names a remote chat by its host's login, never by this app's accounts or the host", () => {
    const session = { usedPercent: 40, windowMinutes: 300, resetsAt: null, resetDescription: null }
    const snapshot = {
      claude: { accounts: [], activeAccountId: null, systemLoginEmail: 'p@moshealth.com' },
      codex: { accounts: [], activeAccountId: null },
      rateLimits: { claude: { session, weekly: null }, inactiveClaudeAccounts: [] }
    } as unknown as ProviderAccountsSnapshot
    const usage = resolveRemoteChatClaudeUsage(snapshot, '/home/p/.claude/projects/x/s.jsonl')
    expect(usage.name).toBe('moshealth')
    expect(usage.limits?.session).toBe(session)

    const noEmail = {
      ...snapshot,
      claude: { ...snapshot.claude, systemLoginEmail: undefined }
    } as ProviderAccountsSnapshot
    // An older host reports no login: no name at all, never the machine's.
    expect(resolveRemoteChatClaudeUsage(noEmail, null)).toMatchObject({ name: null, email: null })
  })
})
