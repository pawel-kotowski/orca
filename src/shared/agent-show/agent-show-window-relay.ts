import type { AgentShowContext, AgentShowRequest, AgentShowResult } from './agent-show-contract'

// Why: one generic main→renderer round trip carries every show kind.
export type AgentShowWindowRequest = { request: AgentShowRequest; context: AgentShowContext }
export type AgentShowWindowRequestMessage = AgentShowWindowRequest & { requestId: string }
export type AgentShowWindowReply = { requestId: string; result: AgentShowResult }

export type AgentShowSnapResult = { path: string; width: number; height: number }
