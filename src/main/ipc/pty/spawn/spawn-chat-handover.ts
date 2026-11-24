import {
  CHAT_HANDOVER_ENV,
  claimStructuredChatTerminalSpawn,
  type StructuredChatTerminalSpawn
} from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import type { PtySpawnOperationState } from './spawn-operation-state'

// A copy has its own conversation, though its command names the source.
const COPIES = /--fork-session|\bcodex['"]?\s+(?:.*\s)?['"]?fork\b/

/** Local: a start that a held chat's conversation is in, claimed before anything is stopped for it. */
export function claimChatHandoverSpawn(
  args: Pick<
    PtySpawnOperationState['args'],
    'env' | 'command' | 'resumeProviderSession' | 'connectionId' | 'sessionId' | 'resumeOrigin'
  >
): StructuredChatTerminalSpawn | null {
  const token = args.env?.[CHAT_HANDOVER_ENV]
  if (args.connectionId) {
    return null
  }
  const command = args.command ?? ''
  return claimStructuredChatTerminalSpawn(
    token,
    (conversationId) =>
      // A reattach's terminal is known already, and a saved restore of a held conversation is refused.
      !args.sessionId &&
      args.resumeOrigin !== 'saved' &&
      !COPIES.test(command) &&
      (args.resumeProviderSession?.id === conversationId || command.includes(conversationId))
  )
}

/** Local: the token stays with Orca, so no agent and no later start of the pane carries it. */
export function stripChatHandoverToken(
  ctx: Pick<PtySpawnOperationState, 'args' | 'spawnOptions'>
): void {
  for (const holder of [ctx.spawnOptions, ctx.args]) {
    if (holder.env?.[CHAT_HANDOVER_ENV] !== undefined) {
      const { [CHAT_HANDOVER_ENV]: _token, ...env } = holder.env
      holder.env = env
    }
  }
}
