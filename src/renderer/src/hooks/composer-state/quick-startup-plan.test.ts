import { describe, expect, it } from 'vitest'
import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../../../shared/claude-workspace-account'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { buildQuickComposerStartup } from './quick-startup-plan'

function startup(agent: TuiAgent, claudeAccountId: string | null) {
  return buildQuickComposerStartup({
    agent,
    prompt: '',
    draftPrompt: null,
    settings: null,
    launchHost: { kind: 'known', platform: 'darwin', hostKind: 'local' },
    shell: null,
    isRemote: false,
    telemetrySource: undefined,
    claudeAccountId
  })
}

describe('the composer startup for a workspace Claude account', () => {
  it('asks the startup spawn for the picked account, on Claude only', () => {
    const claude = startup('claude', 'mos-account')
    expect(claude.startupPlan?.env?.[CLAUDE_WORKSPACE_ACCOUNT_ENV]).toBe('mos-account')
    expect(claude.backendStartup?.env?.[CLAUDE_WORKSPACE_ACCOUNT_ENV]).toBe('mos-account')
    expect(startup('codex', 'mos-account').startupPlan?.env ?? {}).not.toHaveProperty(
      CLAUDE_WORKSPACE_ACCOUNT_ENV
    )
    expect(startup('claude', null).startupPlan?.env ?? {}).not.toHaveProperty(
      CLAUDE_WORKSPACE_ACCOUNT_ENV
    )
  })
})
