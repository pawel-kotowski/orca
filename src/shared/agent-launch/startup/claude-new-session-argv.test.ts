import { describe, expect, it } from 'vitest'
import { getClaudeNewSessionArgv } from './agent-resume-argv'
import { buildAgentResumeStartupPlan } from './tui-agent-resume-startup'

const session = { key: 'session_id', id: 'b80eb533-52f4-4668-96d3-c5f3c17c4559' } as const

describe('an empty Claude chat moved to another account', () => {
  it('starts its session id fresh instead of resuming a conversation never written', () => {
    expect(getClaudeNewSessionArgv(session)).toEqual(['claude', '--session-id', session.id])
    expect(getClaudeNewSessionArgv({ ...session, effort: 'high' })).toEqual([
      'claude',
      '--effort',
      'high',
      '--session-id',
      session.id
    ])
  })

  it('keeps the launch flags and drops --resume', () => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'claude',
      providerSession: session,
      cmdOverrides: {},
      platform: 'darwin',
      agentArgs: '--dangerously-skip-permissions',
      moveClaudeAccount: true,
      claudeNewSession: true
    })
    expect(plan?.launchCommand).toContain('--dangerously-skip-permissions')
    expect(plan?.launchCommand).toContain(`'--session-id' '${session.id}'`)
    expect(plan?.launchCommand).not.toContain('--resume')
  })
})
