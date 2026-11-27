import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionTurnCompletionEvent } from '../../../shared/agent-session/view/agent-session-turn-completion-wire'
import { moveChatAgent, stopAgentBetweenTurns } from './chat-login-move'

const completion = (sessionId: string): AgentSessionTurnCompletionEvent => ({
  type: 'completion',
  completion: {
    scope: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'w',
      workspaceKind: 'git-worktree'
    },
    sessionId,
    turnId: 't',
    outcome: 'success',
    completedAt: 1
  }
})

function deps(child: { phase: string } | null, workOpen = false, working = false) {
  return {
    serialize: <T>(_id: string, run: () => Promise<T>) => run(),
    child: () => child,
    childWorkOpen: () => workOpen,
    working: async () => working,
    stop: vi.fn(async () => {})
  }
}

describe('a chat moved to another login', () => {
  it('stops between turns, open dispatch or not, and never in a turn or with background work', async () => {
    const idle = deps({ phase: 'running' })
    expect(await stopAgentBetweenTurns('s', idle)).toBe(true)
    expect(idle.stop).toHaveBeenCalledWith('s')
    for (const busy of [
      deps({ phase: 'running' }, true),
      deps({ phase: 'running' }, false, true),
      deps({ phase: 'starting' })
    ]) {
      expect(await stopAgentBetweenTurns('s', busy)).toBe(false)
      expect(busy.stop).not.toHaveBeenCalled()
    }
    // No agent runs on the old launch: nothing to stop, the next start takes the new one.
    expect(await stopAgentBetweenTurns('s', deps(null))).toBe(true)
  })

  it('looks again after the turn ended under background work, until that work is done', async () => {
    let emit: ((event: AgentSessionTurnCompletionEvent) => void) | undefined
    const dispose = vi.fn()
    let backgroundWork = true
    const host = {
      stopAgentBetweenTurns: vi.fn(async () => !backgroundWork),
      subscribeTurnCompletions: (subscriber: {
        emit: (event: AgentSessionTurnCompletionEvent) => void
      }) => {
        emit = subscriber.emit
        return dispose
      }
    }
    backgroundWork = true
    expect(await moveChatAgent(host, 'bg', 10)).toBe('after_work')
    emit?.(completion('bg'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(dispose).not.toHaveBeenCalled()
    backgroundWork = false
    await vi.waitFor(() => expect(dispose).toHaveBeenCalled())
    const calls = host.stopAgentBetweenTurns.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(host.stopAgentBetweenTurns.mock.calls.length).toBe(calls)
  })

  it('in a turn, it stops when that turn ends', async () => {
    let emit: ((event: AgentSessionTurnCompletionEvent) => void) | undefined
    const dispose = vi.fn()
    let turnRunning = true
    const host = {
      stopAgentBetweenTurns: vi.fn(async () => !turnRunning),
      subscribeTurnCompletions: (subscriber: {
        emit: (event: AgentSessionTurnCompletionEvent) => void
      }) => {
        emit = subscriber.emit
        return dispose
      }
    }
    expect(await moveChatAgent(host, 's')).toBe('after_work')
    turnRunning = false
    // A completion of another chat is not this one's.
    emit?.(completion('other'))
    await Promise.resolve()
    expect(host.stopAgentBetweenTurns).toHaveBeenCalledTimes(1)
    emit?.(completion('s'))
    await vi.waitFor(() => expect(dispose).toHaveBeenCalled())
    expect(host.stopAgentBetweenTurns).toHaveBeenCalledTimes(2)
  })
})
