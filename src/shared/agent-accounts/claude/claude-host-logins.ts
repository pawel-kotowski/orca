/** A Claude login a machine can run a session on, whoever made its folder (Orca, the user, a box). */
export type ClaudeHostLogin = {
  /** The login's CLAUDE_CONFIG_DIR (the system login's is `~/.claude`). */
  configDir: string
  /** The Orca-managed account whose home this folder is; null for any other folder. */
  accountId: string | null
  email: string
  organizationName: string | null
}

export type ClaudeHostLogins = {
  logins: ClaudeHostLogin[]
  /** The folder a chat was told to move to while its turn still runs; null otherwise. */
  movingTo: string | null
  /** The chat's Claude has commands running in the background, which a move stops. */
  backgroundWork: boolean
}

export type ClaudeLoginMoveRefusal =
  /** The host no longer has this login. */
  | 'unknown_login'
  /** Not a terminal of this host's own (gone, SSH, WSL). */
  | 'not_local'
  /** The terminal names no Claude conversation to move. */
  | 'no_session'
  /** The login's folder cannot read this conversation. */
  | 'not_shared'
  /** Another terminal runs this conversation. */
  | 'running_elsewhere'
  /** Something other than Claude or a shell has the terminal. */
  | 'terminal_busy'
  /** Claude did not stop. */
  | 'stop_failed'
  /** The resume was typed but no Claude came up on the login. */
  | 'start_failed'

export type ClaudeLoginMoveResult =
  /** Claude restarted (or started, when none ran) on the login. */
  | { outcome: 'moved' }
  /** It moves once its running turn ends. */
  | { outcome: 'queued' }
  /** It already runs on the login; a move waiting for its turn is off. */
  | { outcome: 'unchanged' }
  | { outcome: 'refused'; reason: ClaudeLoginMoveRefusal }
