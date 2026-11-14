import type { AgentShowResult } from '../../../shared/agent-show/agent-show-contract'

// Why: placeholder each area replaces with its real handler; the spine compiles before the areas land.
export function agentShowNotReady(kind: string): Promise<AgentShowResult> {
  return Promise.resolve({
    ok: false,
    code: 'not_implemented',
    message: `orca show ${kind} is not built yet`
  })
}
