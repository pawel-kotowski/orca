import type { ClaudeSessionLogin } from '../../../agent-accounts/claude/claude-session-login'

/** An account of the chat's host its workspace can run Claude on. */
export type AgentSessionClaudeAccountChoice = {
  accountId: string
  email: string
  /** The host cannot move a chat to it now. */
  signedOut?: true
}

export type AgentSessionClaudeAccount =
  | {
      status: 'ok'
      /** The running agent's login; null while none runs. */
      running: ClaudeSessionLogin | null
      /** The login the chat's next start runs on. */
      next: ClaudeSessionLogin
      choices: AgentSessionClaudeAccountChoice[]
    }
  /** The host has no such chat (yet): a new one reaches it a moment after its box is drawn. */
  | { status: 'unknown_chat' }
  | { status: 'unsupported' }

export type AgentSessionClaudeAccountRefusal =
  /** The host no longer has this account, or it is signed out. */
  | 'unknown_account'
  /** Its folder could not be set up. */
  | 'setup_failed'
  /** Its folder cannot read this conversation. */
  | 'not_shared'
  /** The chat does not run on one of its host's accounts. */
  | 'not_local'

export type AgentSessionSetClaudeAccountResult =
  | { outcome: 'next_message' }
  /** Owed work keeps the running agent; a message after it moves the chat. */
  | { outcome: 'after_work' }
  /** The chat already runs on it. */
  | { outcome: 'unchanged' }
  | { outcome: 'refused'; reason: AgentSessionClaudeAccountRefusal }
