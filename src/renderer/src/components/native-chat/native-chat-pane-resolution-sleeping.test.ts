import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import { resolveNativeChatSession } from './native-chat-pane-resolution'

const sleepingSession = {
  agent: 'claude' as const,
  providerSession: {
    key: 'session_id' as const,
    id: 'restored-session',
    transcriptPath: '/home/me/.claude/projects/x/restored-session.jsonl'
  }
}

// After a restart main replays an idle agent's saved session as a session-only update, which the
// store keeps as a sleeping record and takes out of live status. The chat must still find it.
describe('resolveNativeChatSession with a sleeping session', () => {
  it('reads the session from the sleeping record when live status has none', () => {
    const resolution = resolveNativeChatSession({
      paneKey: 'tab:leaf',
      ptyId: 'pty-1',
      launchAgent: 'claude',
      sleepingSession
    })
    expect(resolution).toMatchObject({
      agent: 'claude',
      sessionId: 'restored-session',
      transcriptPath: '/home/me/.claude/projects/x/restored-session.jsonl'
    })
  })

  it('finds the agent from the sleeping record when nothing else names it', () => {
    expect(
      resolveNativeChatSession({ paneKey: 'tab:leaf', ptyId: null, sleepingSession })?.sessionId
    ).toBe('restored-session')
  })

  it("keeps the live status's session over the sleeping one", () => {
    const resolution = resolveNativeChatSession({
      paneKey: 'tab:leaf',
      ptyId: 'pty-1',
      agentStatusEntry: {
        agentType: 'claude',
        providerSession: { key: 'session_id', id: 'live-session' }
      } as AgentStatusEntry,
      sleepingSession
    })
    expect(resolution?.sessionId).toBe('live-session')
  })

  it('ignores a sleeping session of another agent', () => {
    const resolution = resolveNativeChatSession({
      paneKey: 'tab:leaf',
      ptyId: 'pty-1',
      launchAgent: 'codex',
      sleepingSession
    })
    expect(resolution?.sessionId).toBeNull()
  })
})
