/** Handing a chat's own conversation to a terminal, and taking it back; never two writers at once. */
export type AgentSessionTerminalHandoverAction = 'begin' | 'bind' | 'end'

export type AgentSessionTerminalHandoverResult =
  /** The chat's agent is stopped and cannot start again until the terminal is done. */
  | { outcome: 'held' }
  /** The chat's agent has work; nothing changed. */
  | { outcome: 'busy' }
  /** The chat has its conversation back, with the turns the terminal added. */
  | { outcome: 'back' }
  /** A terminal still runs it. */
  | { outcome: 'open' }
  | { outcome: 'unsupported' }
