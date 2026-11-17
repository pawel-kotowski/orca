/** A windowless server asks its connected desktops, newest first, to show `orca show` requests. */
import { randomUUID } from 'node:crypto'
import type {
  AgentShowRelayAnswer,
  AgentShowRelayAsk,
  AgentShowRelayRequestEvent,
  AgentShowRelayResultParams
} from '../../../shared/agent-show/agent-show-client-relay'
import type { AgentShowResult } from '../../../shared/agent-show/agent-show-contract'

// Why 25s: the desktop waits up to 20s for its window; the CLI gives the whole call 30s.
const DESKTOP_TIMEOUT_MS = 25_000

type Volunteer = {
  pairedDeviceId: string
  emit: (event: AgentShowRelayRequestEvent) => void
}

type Pending = { pairedDeviceId: string; resolve: (answer: AgentShowRelayAnswer) => void }

export class AgentShowClientRelayRegistry {
  private readonly volunteers: Volunteer[] = []
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly options: { desktopTimeoutMs?: number } = {}) {}

  /** One renderer subscription of a desktop; its cleanup unregisters it. */
  register(input: Volunteer): () => void {
    const volunteer = { ...input }
    this.volunteers.push(volunteer)
    return () => {
      const index = this.volunteers.indexOf(volunteer)
      if (index === -1) {
        return
      }
      this.volunteers.splice(index, 1)
      if (this.volunteers.some((entry) => entry.pairedDeviceId === volunteer.pairedDeviceId)) {
        return
      }
      for (const pending of this.pending.values()) {
        if (pending.pairedDeviceId === volunteer.pairedDeviceId) {
          pending.resolve({ kind: 'failed', error: 'renderer_unavailable' })
        }
      }
    }
  }

  hasVolunteer(): boolean {
    return this.volunteers.length > 0
  }

  async show(ask: Extract<AgentShowRelayAsk, { kind: 'show' }>): Promise<AgentShowResult> {
    const answer = await this.askDesktops(ask)
    if (answer.kind !== 'shown') {
      throw new Error('agent_show_relay_bad_answer')
    }
    return answer.result
  }

  async snap(): Promise<Extract<AgentShowRelayAnswer, { kind: 'shot' }>['shot']> {
    const answer = await this.askDesktops({ kind: 'snap' })
    if (answer.kind !== 'shot') {
      throw new Error('agent_show_relay_bad_answer')
    }
    return answer.shot
  }

  settle(caller: { pairedDeviceId: string }, result: AgentShowRelayResultParams): boolean {
    const pending = this.pending.get(result.requestId)
    if (!pending || pending.pairedDeviceId !== caller.pairedDeviceId) {
      return false
    }
    if (result.declined) {
      pending.resolve('declined')
    } else if (result.error) {
      pending.resolve({ kind: 'failed', error: result.error })
    } else if (result.shot) {
      pending.resolve({ kind: 'shot', shot: result.shot })
    } else if (isShowResult(result.result)) {
      pending.resolve({ kind: 'shown', result: result.result })
    } else {
      pending.resolve({ kind: 'failed', error: 'agent_show_relay_bad_answer' })
    }
    return true
  }

  /** Newest desktop first; only a decline (it does not show that workspace) moves on. */
  private async askDesktops(
    ask: AgentShowRelayAsk
  ): Promise<Exclude<AgentShowRelayAnswer, 'declined' | { kind: 'failed' }>> {
    const asked = new Set<string>()
    for (;;) {
      const volunteer = this.volunteers.findLast((entry) => !asked.has(entry.pairedDeviceId))
      if (!volunteer) {
        throw new Error('renderer_unavailable')
      }
      asked.add(volunteer.pairedDeviceId)
      const answer = await this.ask(volunteer, ask)
      if (answer === 'declined') {
        continue
      }
      if (answer.kind === 'failed') {
        throw new Error(answer.error)
      }
      return answer
    }
  }

  private ask(volunteer: Volunteer, ask: AgentShowRelayAsk): Promise<AgentShowRelayAnswer> {
    const requestId = randomUUID()
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => answer({ kind: 'failed', error: 'agent_show_timeout' }),
        this.options.desktopTimeoutMs ?? DESKTOP_TIMEOUT_MS
      )
      const answer = (value: AgentShowRelayAnswer): void => {
        clearTimeout(timer)
        this.pending.delete(requestId)
        resolve(value)
      }
      this.pending.set(requestId, { pairedDeviceId: volunteer.pairedDeviceId, resolve: answer })
      try {
        // Why one subscription: two windows of one desktop must not both show it.
        volunteer.emit({ type: 'agentShowRequested', requestId, ...ask })
      } catch {
        // That subscription's socket is gone; its cleanup unregisters it.
        answer('declined')
      }
    })
  }
}

function isShowResult(value: unknown): value is AgentShowResult {
  return Boolean(
    value && typeof value === 'object' && typeof (value as { ok?: unknown }).ok === 'boolean'
  )
}

const registries = new WeakMap<object, AgentShowClientRelayRegistry>()

export function getAgentShowClientRelayRegistry(runtime: object): AgentShowClientRelayRegistry {
  let registry = registries.get(runtime)
  if (!registry) {
    registry = new AgentShowClientRelayRegistry()
    registries.set(runtime, registry)
  }
  return registry
}
