import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeHookPayload } from './normalize-hook-payload'
import { createHookListenerState, type HookListenerState } from '../listener-state'
import { makePaneKey } from '../../workspace-layout/stable-pane-id'

const PANE_KEY = makePaneKey('reach-out', '33333333-3333-4333-8333-333333333333')

describe('move-to-inbox reach-out on hook rows', () => {
  let state: HookListenerState

  beforeEach(() => {
    state = createHookListenerState()
  })

  function hook(source: 'claude' | 'codex', payload: Record<string, unknown>) {
    return normalizeHookPayload(state, source, { paneKey: PANE_KEY, payload }, 'production')
      ?.payload
  }

  it('sends the pane’s reach-out on every later status, whatever the agent', () => {
    hook('claude', { hook_event_name: 'UserPromptSubmit', prompt: 'ping me when lots merge' })
    state.reachOutByPaneKey.set(PANE_KEY, { message: 'All four lots merged', at: 42 })
    expect(
      hook('claude', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} })?.reachOut
    ).toEqual({ message: 'All four lots merged', at: 42 })
    expect(hook('claude', { hook_event_name: 'Stop' })?.reachOut).toEqual({
      message: 'All four lots merged',
      at: 42
    })
  })

  it('no longer takes Claude’s PushNotification as a reach-out', () => {
    hook('claude', { hook_event_name: 'UserPromptSubmit', prompt: 'go' })
    const sent = hook('claude', {
      hook_event_name: 'PreToolUse',
      tool_name: 'PushNotification',
      tool_input: { message: 'build ready' }
    })
    expect(sent?.reachOut).toBeUndefined()
  })
})
