/** Handing a chat's own conversation to a terminal, and taking it back; never two writers at once. */
export type AgentSessionTerminalHandoverAction = 'begin' | 'abandon' | 'end' | 'status'

/** Carries a handover's token in its terminal's launch; the host takes it out before the spawn. */
export const CHAT_HANDOVER_ENV = 'ORCA_CHAT_HANDOVER_TOKEN'

export type AgentSessionTerminalHandoverResult =
  /** The chat's agent is stopped and cannot start again until the terminal is done. `opening`: its
   *  terminal was not started yet. */
  | { outcome: 'held'; holdId: string; paneKey?: string; opening?: true }
  /** The chat's agent has work; nothing changed. */
  | { outcome: 'busy' }
  /** The chat has its conversation back, with the turns the terminal added. */
  | { outcome: 'back' }
  /** No terminal has it. */
  | { outcome: 'free' }
  /** A terminal still runs it. */
  | { outcome: 'open'; holdId?: string; paneKey?: string }
  | { outcome: 'unsupported' }
