import { describe, expect, it, vi } from 'vitest'
import { createAgentCompletionCoordinator } from './agent-completion-coordinator'
import {
  HOOK_DONE_QUIET_MS,
  useAgentCompletionCoordinatorLifecycle
} from './agent-completion-coordinator-test-harness'
import { normalizeHookPayload } from '../../../../shared/agent-hook-listener'
import { createHookListenerState } from '../../../../shared/agent-hook-listener/listener-state'
import { makePaneKey } from '../../../../shared/stable-pane-id'

// Feed real hook-listener output to the real coordinator to verify monitoring turn boundaries agree across layers.
const PANE = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
const RUNNING_SHELL = {
  id: 'shell-1',
  type: 'shell',
  status: 'running',
  description: 'Run the dev server',
  command: 'pnpm dev'
}

function hookPayload(
  state: ReturnType<typeof createHookListenerState>,
  payload: Record<string, unknown>
) {
  const parsed = normalizeHookPayload(
    state,
    'claude',
    { paneKey: PANE, payload },
    'production'
  )?.payload
  if (!parsed) {
    throw new Error('listener produced no payload')
  }
  // The hook server stamps stateStartedAt on the way to the renderer.
  return { ...parsed, stateStartedAt: 1_700_000_000_000 }
}

function createCoordinator() {
  const dispatchCompletion = vi.fn()
  const dispatchHookLifecycle = vi.fn()
  const coordinator = createAgentCompletionCoordinator({
    paneKey: PANE,
    getPtyId: () => 'pty-1',
    inspectProcess: vi.fn(),
    dispatchCompletion,
    dispatchHookLifecycle,
    isLive: () => true
  })
  return { coordinator, dispatchCompletion, dispatchHookLifecycle }
}

function completionMeta(dispatchCompletion: ReturnType<typeof vi.fn>) {
  return dispatchCompletion.mock.calls[0]?.[1] as
    | { source?: string; agentStatus?: { state?: string; workingMode?: string } }
    | undefined
}

describe('completion notification when a lead turn ends into monitoring', () => {
  useAgentCompletionCoordinatorLifecycle()

  it('does not announce a turn end while a background shell keeps the pane working', () => {
    const listener = createHookListenerState()
    const { coordinator, dispatchCompletion, dispatchHookLifecycle } = createCoordinator()

    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'UserPromptSubmit', prompt: 'run the tests' })
    )
    const monitoring = hookPayload(listener, {
      hook_event_name: 'Stop',
      background_tasks: [RUNNING_SHELL]
    })

    expect(monitoring).toMatchObject({ state: 'working', workingMode: 'monitoring' })
    expect(monitoring.turnCompletedAt).toBeUndefined()

    coordinator.observeHookStatus(monitoring)
    vi.advanceTimersByTime(HOOK_DONE_QUIET_MS * 2)

    // Why: the lead wakes when the shell reports; ringing now would call it done before it is.
    expect(dispatchCompletion).not.toHaveBeenCalled()
    expect(dispatchHookLifecycle).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'done' })
    )
  })

  it('announces once, when the wake-up turn ends with nothing left running', () => {
    const listener = createHookListenerState()
    const { coordinator, dispatchCompletion } = createCoordinator()

    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'UserPromptSubmit', prompt: 'run the tests' })
    )
    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'Stop', background_tasks: [RUNNING_SHELL] })
    )
    vi.advanceTimersByTime(HOOK_DONE_QUIET_MS * 2)
    expect(dispatchCompletion).not.toHaveBeenCalled()

    coordinator.observeHookStatus(
      hookPayload(listener, {
        hook_event_name: 'UserPromptSubmit',
        prompt:
          '<task-notification>\n<task-id>shell-1</task-id>\n<status>completed</status>\n</task-notification>'
      })
    )
    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'Stop', background_tasks: [] })
    )
    vi.advanceTimersByTime(HOOK_DONE_QUIET_MS * 2)

    expect(dispatchCompletion).toHaveBeenCalledTimes(1)
    expect(completionMeta(dispatchCompletion)?.agentStatus?.state).toBe('done')
  })

  it('does not announce mid-turn while the agent is still working in the foreground', () => {
    const listener = createHookListenerState()
    const { coordinator, dispatchCompletion } = createCoordinator()

    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'UserPromptSubmit', prompt: 'do the thing' })
    )
    coordinator.observeHookStatus(
      hookPayload(listener, { hook_event_name: 'PreToolUse', tool_name: 'Bash' })
    )

    expect(dispatchCompletion).not.toHaveBeenCalled()
  })
})
