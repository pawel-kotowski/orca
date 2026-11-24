/** Handing a chat's own conversation to a terminal, and taking it back; never two writers at once. */
export type AgentSessionTerminalHandoverAction = 'begin' | 'bind' | 'abandon' | 'end' | 'status'

export type AgentSessionTerminalHandoverResult =
  /** The chat's agent is stopped and cannot start again until the terminal is done. */
  | { outcome: 'held'; paneKey?: string }
  /** The chat's agent has work; nothing changed. */
  | { outcome: 'busy' }
  /** The chat has its conversation back, with the turns the terminal added. */
  | { outcome: 'back' }
  /** No terminal has it. */
  | { outcome: 'free' }
  /** A terminal still runs it. */
  | { outcome: 'open'; paneKey?: string }
  | { outcome: 'unsupported' }
