import { describe, expect, it, vi } from 'vitest'
import type { AgentShowRelayRequestEvent } from '../../../shared/agent-show/agent-show-client-relay'
import { AgentShowClientRelayRegistry } from './agent-show-client-relay-registry'

const context = { worktreeId: 'w1', worktreePath: '/w1', ownerTabId: 'tab', focus: true }
const show = { kind: 'show' as const, request: { kind: 'state' as const }, context }

describe('AgentShowClientRelayRegistry', () => {
  it('fails with renderer_unavailable when no desktop is connected', async () => {
    const registry = new AgentShowClientRelayRegistry()
    expect(registry.hasVolunteer()).toBe(false)
    await expect(registry.show(show)).rejects.toThrow('renderer_unavailable')
  })

  it('relays to the connected desktop and returns what its window showed', async () => {
    const registry = new AgentShowClientRelayRegistry()
    const emit = vi.fn((event: AgentShowRelayRequestEvent) => {
      queueMicrotask(() =>
        registry.settle(
          { pairedDeviceId: 'laptop' },
          { requestId: event.requestId, result: { ok: true, visible: true } }
        )
      )
    })
    registry.register({ pairedDeviceId: 'laptop', emit })
    await expect(registry.show(show)).resolves.toEqual({ ok: true, visible: true })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agentShowRequested', kind: 'show', context })
    )
  })

  it('asks the next desktop when the newest does not show that workspace', async () => {
    const registry = new AgentShowClientRelayRegistry()
    const answer = (device: string, declined: boolean) => (event: AgentShowRelayRequestEvent) =>
      queueMicrotask(() =>
        registry.settle(
          { pairedDeviceId: device },
          declined
            ? { requestId: event.requestId, declined: true }
            : { requestId: event.requestId, result: { ok: true, visible: false } }
        )
      )
    registry.register({ pairedDeviceId: 'older', emit: answer('older', false) })
    registry.register({ pairedDeviceId: 'newer', emit: answer('newer', true) })
    await expect(registry.show(show)).resolves.toEqual({ ok: true, visible: false })
  })

  it('fails with renderer_unavailable when every desktop declines', async () => {
    const registry = new AgentShowClientRelayRegistry()
    registry.register({
      pairedDeviceId: 'laptop',
      emit: (event) =>
        queueMicrotask(() =>
          registry.settle(
            { pairedDeviceId: 'laptop' },
            { requestId: event.requestId, declined: true }
          )
        )
    })
    await expect(registry.show(show)).rejects.toThrow('renderer_unavailable')
  })

  it('ignores an answer from another device and times out', async () => {
    const registry = new AgentShowClientRelayRegistry({ desktopTimeoutMs: 20 })
    registry.register({
      pairedDeviceId: 'laptop',
      emit: (event) => {
        expect(
          registry.settle(
            { pairedDeviceId: 'intruder' },
            { requestId: event.requestId, declined: true }
          )
        ).toBe(false)
      }
    })
    await expect(registry.show(show)).rejects.toThrow('agent_show_timeout')
  })

  it('relays a snap', async () => {
    const registry = new AgentShowClientRelayRegistry()
    const shot = { mime: 'image/png' as const, base64: 'iVBO', width: 2, height: 1 }
    registry.register({
      pairedDeviceId: 'laptop',
      emit: (event) =>
        queueMicrotask(() =>
          registry.settle({ pairedDeviceId: 'laptop' }, { requestId: event.requestId, shot })
        )
    })
    await expect(registry.snap()).resolves.toEqual(shot)
  })

  it('stops waiting when the asked desktop disconnects', async () => {
    const registry = new AgentShowClientRelayRegistry()
    let release = (): void => {}
    release = registry.register({ pairedDeviceId: 'laptop', emit: () => queueMicrotask(release) })
    await expect(registry.show(show)).rejects.toThrow('renderer_unavailable')
    expect(registry.hasVolunteer()).toBe(false)
  })
})
