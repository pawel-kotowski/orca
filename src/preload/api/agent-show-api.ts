import type { AgentShowRelayShot } from '../../shared/agent-show/agent-show-client-relay'
import type {
  AgentShowWindowReply,
  AgentShowWindowRequestMessage
} from '../../shared/agent-show/agent-show-window-relay'

export type AgentShowApi = {
  onRequest: (callback: (request: AgentShowWindowRequestMessage) => void) => () => void
  reply: (reply: AgentShowWindowReply) => void
  /** This window as an image small enough to relay to a windowless server's `orca show snap`. */
  captureWindow: () => Promise<AgentShowRelayShot>
}
