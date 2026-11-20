// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import type { ClaudeSessionLogin } from '../../../../shared/agent-accounts/claude/claude-session-login'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))

import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import {
  resetClaudeSessionLoginsForTests,
  useClaudeSessionLogin
} from './native-chat-claude-session-login'
import {
  isUnmanagedClaudeFolder,
  resolveChatClaudeAccount,
  sessionLoginUsage
} from './native-chat-account-usage'

const ROBO = 'e6945bb8-13b2-463f-abda-c22153bef8ff'
const ROBO_HOME = `/Users/p/Library/Application Support/orca/claude-profiles/${ROBO}/home`
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

const login = (configDir: string, email: string): ClaudeSessionLogin => ({
  configDir,
  accountId: null,
  email,
  organizationName: null,
  limits: null
})

describe('a chat names the login its session runs on now (local)', () => {
  beforeEach(() => {
    resetClaudeSessionLoginsForTests()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('never names a saved account for a session in another folder', () => {
    const base = {
      accounts: [account(ROBO, 'me@robotec.ai')],
      accountByWorktreeId: { wt: ROBO },
      activeAccountId: ROBO,
      worktreeId: 'wt'
    }
    // limit-move restarted the workspace's robotec chat on the box's personal login.
    expect(
      resolveChatClaudeAccount({
        ...base,
        transcriptPath: '/home/p/.claude-logins/personal/projects/-repo/s.jsonl'
      })
    ).toBeNull()
    expect(
      resolveChatClaudeAccount({ ...base, transcriptPath: `${ROBO_HOME}/projects/-repo/s.jsonl` })
        ?.id
    ).toBe(ROBO)
    expect(isUnmanagedClaudeFolder(`${ROBO_HOME}/projects/-repo/s.jsonl`)).toBe(false)
    expect(isUnmanagedClaudeFolder('/home/p/.claude/projects/-repo/s.jsonl')).toBe(true)
    expect(isUnmanagedClaudeFolder(null)).toBe(false)
  })

  it('shows the folder’s own login, nothing while it is asked, and falls back for an older host', () => {
    expect(
      sessionLoginUsage({
        status: 'ready',
        login: login('/home/p/.claude-logins/personal', 'me@gmail.com')
      })
    ).toMatchObject({ name: 'personal', email: 'me@gmail.com', accountId: null })
    expect(sessionLoginUsage({ status: 'loading' })).toBeNull()
    expect(sessionLoginUsage({ status: 'ready', login: null })).toBeNull()
    expect(sessionLoginUsage({ status: 'failed' })).toBeUndefined()
  })

  it('asks the host again as soon as the session names another folder, both ways', async () => {
    const rpc = vi.mocked(callRuntimeRpc)
    rpc.mockImplementation(async (_target, _method, params) => {
      const path = (params as { transcriptPath: string }).transcriptPath
      return path.includes('.claude-logins/personal')
        ? login('/home/p/.claude-logins/personal', 'me@gmail.com')
        : login('/home/p/.claude', 'me@robotec.ai')
    })
    const robotec = '/home/p/.claude/projects/-repo/s.jsonl'
    const personal = '/home/p/.claude-logins/personal/projects/-repo/s.jsonl'
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useClaudeSessionLogin(path, 'box-env'),
      { initialProps: { path: robotec } }
    )
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ready', login: { email: 'me@robotec.ai' } })
    )
    act(() => rerender({ path: personal }))
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ready', login: { email: 'me@gmail.com' } })
    )
    act(() => rerender({ path: robotec }))
    // Back on the box's own login: the answer it already has, at once.
    expect(result.current).toMatchObject({ status: 'ready', login: { email: 'me@robotec.ai' } })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'box-env' },
      'nativeChat.claudeSessionLogin',
      { transcriptPath: personal },
      expect.anything()
    )
  })

  it('reads a local session through main', async () => {
    const read = vi.fn(async () => login('/Users/p/.claude', 'me@gmail.com'))
    Object.assign(window, { api: { nativeChat: { readClaudeSessionLogin: read } } })
    const { result } = renderHook(() =>
      useClaudeSessionLogin('/Users/p/.claude/projects/-repo/s.jsonl', 'local')
    )
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }))
    expect(read).toHaveBeenCalledWith({ transcriptPath: '/Users/p/.claude/projects/-repo/s.jsonl' })
  })
})
