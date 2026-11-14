import type {
  AgentShowWindowReply,
  AgentShowWindowRequestMessage
} from '../../shared/agent-show/agent-show-window-relay'

export type AgentShowApi = {
  onRequest: (callback: (request: AgentShowWindowRequestMessage) => void) => () => void
  reply: (reply: AgentShowWindowReply) => void
}
