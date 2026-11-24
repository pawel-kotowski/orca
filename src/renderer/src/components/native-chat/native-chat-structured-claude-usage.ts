import type { ClaudeSessionLogin } from '../../../../shared/agent-accounts/claude/claude-session-login'
import type {
  AgentSessionClaudeAccount,
  AgentSessionClaudeAccountChoice
} from '../../../../shared/agent-session/lifecycle/accounts/agent-session-claude-account'

export type StructuredClaudeLogin = Pick<ClaudeSessionLogin, 'accountId' | 'email' | 'limits'>

export type StructuredClaudeUsage = {
  /** The login the chat runs on: its running agent's, else its next start's. */
  shown: StructuredClaudeLogin
  /** The login its next start runs on, when a running agent is still on another. */
  movingTo: StructuredClaudeLogin | null
  choices: AgentSessionClaudeAccountChoice[]
}

/** What a structured chat's footer says of its account; null when its host does not say. */
export function structuredClaudeUsage(
  account: AgentSessionClaudeAccount | null
): StructuredClaudeUsage | null {
  if (account?.status !== 'ok') {
    return null
  }
  const { running, next, choices } = account
  const named = (login: ClaudeSessionLogin): StructuredClaudeLogin => ({
    ...login,
    email:
      login.email ?? choices.find((choice) => choice.accountId === login.accountId)?.email ?? null
  })
  const moving = running !== null && running.configDir !== next.configDir
  return {
    // `next` alone names the account of a folder the system login covers.
    shown: named(moving ? running : next),
    movingTo: moving ? named(next) : null,
    choices
  }
}
