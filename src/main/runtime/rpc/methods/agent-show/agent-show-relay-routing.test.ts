import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../../orca-runtime'
import type { RpcContext } from '../../core'
import { AGENT_SHOW_CLIENT_RELAY_CAPABILITY } from '../../../../../shared/agent-show/agent-show-client-relay'
import { getAgentShowClientRelayRegistry } from '../../../../agent-show/relay/agent-show-client-relay-registry'
import { AGENT_SHOW_METHODS } from './agent-show'

const method = (name: string) => {
  const found = AGENT_SHOW_METHODS.find((entry) => entry.name === name)
  if (!found) {
    throw new Error(name)
  }
  return found.handler as (params: unknown, ctx: Partial<RpcContext>) => Promise<unknown>
}

function boxRuntime(window: unknown = null): OrcaRuntimeService {
  return {
    agentShowWindow: () => window,
    resolveRuntimeFileTarget: async () => ({ worktree: { id: 'repo::/box/mos', path: '/box/mos' } })
  } as unknown as OrcaRuntimeService
}

const params = {
  worktree: 'path:/box/mos',
  request: { kind: 'state' },
  ownerTabId: 'tab-1',
  focus: true
}

describe('agentShow.request on a server', () => {
  it('fails with renderer_unavailable when it has no window and no desktop is connected', async () => {
    await expect(method('agentShow.request')(params, { runtime: boxRuntime() })).rejects.toThrow(
      'renderer_unavailable'
    )
    await expect(method('agentShow.snap')({}, { runtime: boxRuntime() })).rejects.toThrow(
      'renderer_unavailable'
    )
  })

  it('relays to a connected desktop when it has no window', async () => {
    const runtime = boxRuntime()
    const relay = getAgentShowClientRelayRegistry(runtime)
    const asked: unknown[] = []
    relay.register({
      pairedDeviceId: 'laptop',
      emit: (event) => {
        asked.push(event)
        queueMicrotask(() =>
          relay.settle(
            { pairedDeviceId: 'laptop' },
            { requestId: event.requestId, result: { ok: true, visible: true } }
          )
        )
      }
    })
    await expect(method('agentShow.request')(params, { runtime })).resolves.toEqual({
      ok: true,
      visible: true
    })
    expect(asked).toEqual([
      expect.objectContaining({
        kind: 'show',
        request: { kind: 'state' },
        context: {
          worktreeId: 'repo::/box/mos',
          worktreePath: '/box/mos',
          ownerTabId: 'tab-1',
          focus: true
        }
      })
    ])
  })

  it('shows in its own window when it has one, never relaying', async () => {
    const agentShow = vi.fn(async () => ({ ok: true, visible: true }))
    const runtime = boxRuntime({ agentShow })
    const emit = vi.fn()
    getAgentShowClientRelayRegistry(runtime).register({ pairedDeviceId: 'laptop', emit })
    await method('agentShow.request')(params, { runtime })
    expect(agentShow).toHaveBeenCalledOnce()
    expect(emit).not.toHaveBeenCalled()
  })

  it('takes answers only from a paired desktop that advertises the relay', async () => {
    const runtime = boxRuntime()
    const answer = method('agentShow.relayResult')
    expect(() => answer({ requestId: 'r' }, { runtime, clientKind: 'mobile' })).toThrow(
      'authenticated_desktop_client_required'
    )
    expect(() =>
      answer({ requestId: 'r' }, { runtime, clientKind: 'runtime', pairedDeviceId: 'laptop' })
    ).toThrow('agent_show_client_relay_capability_required')
    expect(
      answer(
        { requestId: 'r' },
        {
          runtime,
          clientKind: 'runtime',
          pairedDeviceId: 'laptop',
          clientCapabilities: [AGENT_SHOW_CLIENT_RELAY_CAPABILITY]
        }
      )
    ).toEqual({ accepted: false })
  })
})
