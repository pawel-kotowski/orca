import { describe, expect, it } from 'vitest'
import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../claude-workspace-account'
import { claudeSessionAccountId } from './claude-resume-account'
import { buildAgentResumeStartupPlan } from './tui-agent-resume-startup'

const ACCOUNT = '0af0bbc3-9253-44e7-8c3a-0bf65e546668'
const managedTranscript = `/Users/me/Library/Application Support/orca/claude-profiles/${ACCOUNT}/home/projects/-Users-me-repo/s1.jsonl`
const session = {
  key: 'session_id',
  id: 's1',
  transcriptPath: managedTranscript
} as const

function plan(overrides: Partial<Parameters<typeof buildAgentResumeStartupPlan>[0]> = {}) {
  return buildAgentResumeStartupPlan({
    agent: 'claude',
    providerSession: session,
    cmdOverrides: {},
    platform: 'darwin',
    ...overrides
  })
}

describe('claude resume account', () => {
  it('reads the managed account from the transcript path', () => {
    expect(claudeSessionAccountId(session)).toBe(ACCOUNT)
    expect(
      claudeSessionAccountId({
        transcriptPath: '/Users/me/.claude/projects/x/s1.jsonl'
      })
    ).toBe(null)
    expect(claudeSessionAccountId({})).toBe(null)
  })

  it('resumes a session on the account it ran on', () => {
    expect(plan()?.env).toEqual({ [CLAUDE_WORKSPACE_ACCOUNT_ENV]: ACCOUNT })
  })

  it('keeps the recorded launch env beside the account and out of launchConfig', () => {
    const resumed = plan({ agentEnv: { FOO: 'bar' } })
    expect(resumed?.env).toEqual({
      FOO: 'bar',
      [CLAUDE_WORKSPACE_ACCOUNT_ENV]: ACCOUNT
    })
    expect(JSON.stringify(resumed?.launchConfig ?? {})).not.toContain(CLAUDE_WORKSPACE_ACCOUNT_ENV)
  })

  it('leaves an account move, a remote launch and a System default session unpinned', () => {
    expect(plan({ moveClaudeAccount: true })?.env).toBeUndefined()
    expect(plan({ isRemote: true })?.env).toBeUndefined()
    expect(
      plan({
        providerSession: {
          key: 'session_id',
          id: 's1',
          transcriptPath: '/u/.claude/projects/x/s1.jsonl'
        }
      })?.env
    ).toBeUndefined()
  })
})
