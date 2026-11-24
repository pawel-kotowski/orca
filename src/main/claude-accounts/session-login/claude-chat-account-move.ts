import { realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AgentSessionSetClaudeAccountResult } from '../../../shared/agent-session/lifecycle/accounts/agent-session-claude-account'
import type { ClaudeProfileRouter } from '../profiles/routing/claude-profile-router'

export type ClaudeChatAccountMove = {
  accountId: string
  /** The workspace the chat runs in, whose account a move changes. */
  workspaceId: string
  /** Where the running agent's login lives; null while none runs. */
  runningHome: string | null
  /** The folder whose store holds the conversation; null before it has one. */
  conversationHome: string | null
}

export type ClaudeChatAccountMoveDeps = {
  router: Pick<
    ClaudeProfileRouter,
    | 'accountForLaunch'
    | 'accountLogin'
    | 'coveredBySystemDefault'
    | 'prepareAccount'
    | 'selectedProfile'
    | 'systemDefaultHome'
  >
  hasAccount: (accountId: string) => boolean
  saveWorkspaceAccount: (workspaceId: string, accountId: string) => Promise<unknown>
  owesWork: () => Promise<boolean>
}

async function sharesConversations(from: string, to: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all(
      [from, to].map((home) => realpath(join(home, 'projects')))
    )
    return left === right
  } catch {
    return false
  }
}

/** Moves a chat by its workspace's account; its next start resumes the conversation there. */
export async function moveClaudeChatAccount(
  move: ClaudeChatAccountMove,
  deps: ClaudeChatAccountMoveDeps
): Promise<AgentSessionSetClaudeAccountResult> {
  const { router } = deps
  const { accountId, workspaceId, runningHome, conversationHome } = move
  if (!deps.hasAccount(accountId)) {
    return { outcome: 'refused', reason: 'unknown_account' }
  }
  const covered = router.coveredBySystemDefault(accountId)
  if (!covered && !router.accountLogin(accountId)) {
    return { outcome: 'refused', reason: 'unknown_account' }
  }
  const home = covered
    ? router.systemDefaultHome()
    : await router.prepareAccount(accountId).catch(() => null)
  if (!home) {
    return { outcome: 'refused', reason: 'setup_failed' }
  }
  if (
    conversationHome &&
    resolve(conversationHome) !== resolve(home) &&
    !(await sharesConversations(conversationHome, home))
  ) {
    return { outcome: 'refused', reason: 'not_shared' }
  }
  const selected = router.selectedProfile(router.accountForLaunch(null, workspaceId))?.accountId
  if (selected !== accountId) {
    await deps.saveWorkspaceAccount(workspaceId, accountId)
  }
  if (runningHome ? resolve(runningHome) === resolve(home) : selected === accountId) {
    return { outcome: 'unchanged' }
  }
  return { outcome: runningHome && (await deps.owesWork()) ? 'after_work' : 'next_message' }
}
