import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeHookPayload } from './normalize-hook-payload'
import { createHookListenerState, type HookListenerState } from '../listener-state'
import { makePaneKey } from '../../workspace-layout/stable-pane-id'

const PANE_KEY = makePaneKey('claude-reach-out', '33333333-3333-4333-8333-333333333333')

describe('Claude reach-out (PushNotification)', () => {
  let state: HookListenerState

  beforeEach(() => {
    state = createHookListenerState()
  })

  function claude(payload: Record<string, unknown>) {
    return normalizeHookPayload(state, 'claude', { paneKey: PANE_KEY, payload }, 'production')
      ?.payload
  }

  it('records the main agent’s message and sends it on every later status', () => {
    claude({ hook_event_name: 'UserPromptSubmit', prompt: 'ping me when lots are merged' })
    const sent = claude({
      hook_event_name: 'PreToolUse',
      tool_name: 'PushNotification',
      tool_input: { message: 'All four lots merged', status: 'proactive' }
    })
    expect(sent?.reachOut?.message).toBe('All four lots merged')
    expect(sent?.toolInput).toBe('All four lots merged')
    const at = sent?.reachOut?.at
    claude({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })
    expect(claude({ hook_event_name: 'Stop' })?.reachOut).toEqual({
      message: 'All four lots merged',
      at
    })
  })

  it('ignores a subagent’s PushNotification', () => {
    claude({ hook_event_name: 'UserPromptSubmit', prompt: 'go' })
    const child = claude({
      hook_event_name: 'PreToolUse',
      agent_id: 'agent-1',
      tool_name: 'PushNotification',
      tool_input: { message: 'from a subagent' }
    })
    expect(child?.reachOut).toBeUndefined()
  })
})
