import {
  admitStructuredChatTerminalSpawn,
  bindStructuredChatTerminal,
  CHAT_HANDOVER_ENV,
  failStructuredChatTerminalSpawn,
  settleStructuredChatTerminalSpawn
} from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import type { PtySpawnOperationState } from './spawn-operation-state'

type HandoverTerminal = { ptyId: string | null; paneKey: string | null }

/**
 * Local: the terminal of a chat's handover. Its token leaves the environment here, so no agent and
 * no later start of the pane carries it; the spawn goes on only while the chat is still held for it.
 */
export function takeChatHandoverSpawn(ctx: Pick<PtySpawnOperationState, 'args' | 'spawnOptions'>): {
  admit: (terminal: HandoverTerminal) => void
  bind: (terminal: Parameters<typeof bindStructuredChatTerminal>[1]) => void
  settle: () => void
} | null {
  const token = ctx.spawnOptions.env?.[CHAT_HANDOVER_ENV] ?? ctx.args.env?.[CHAT_HANDOVER_ENV]
  if (!token) {
    return null
  }
  for (const holder of [ctx.spawnOptions, ctx.args]) {
    if (holder.env) {
      const { [CHAT_HANDOVER_ENV]: _token, ...env } = holder.env
      holder.env = env
    }
  }
  return {
    admit: (terminal) => admitStructuredChatTerminalSpawn(token, terminal),
    bind: (terminal) => bindStructuredChatTerminal(token, terminal),
    settle: () => settleStructuredChatTerminalSpawn(token)
  }
}

/** Local: a spawn that failed before its terminal was asked for leaves the chat free. */
export function failChatHandoverSpawn(token: string | undefined): void {
  if (token) {
    failStructuredChatTerminalSpawn(token)
  }
}

export function chatHandoverToken(env: Record<string, string> | undefined): string | undefined {
  return env?.[CHAT_HANDOVER_ENV]
}
