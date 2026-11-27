// `orca chat login` / `orca chat profile`: a chat's agent goes to its new launch at its next start.
import type { AgentSessionTurnCompletionEvent } from '../../../shared/agent-session/view/agent-session-turn-completion-wire'

type BetweenTurnsChild = { phase: string; close?: unknown }

/** Stop a chat's agent when its turn has ended, open dispatch or not (a worker between turns, or
 *  stopped at its usage limit); a turn, a start, background work or a subagent in flight keeps it.
 *  True when no agent runs on the old launch any more (also when none ran). */
export async function stopAgentBetweenTurns(
  sessionId: string,
  deps: {
    serialize: <T>(sessionId: string, run: () => Promise<T>) => Promise<T>
    child: (sessionId: string) => BetweenTurnsChild | null | undefined
    childWorkOpen: (sessionId: string) => boolean
    working: (sessionId: string) => Promise<boolean>
    stop: (sessionId: string) => Promise<void>
  }
): Promise<boolean> {
  return deps.serialize(sessionId, async () => {
    const child = deps.child(sessionId)
    if (!child || child.close) {
      return true
    }
    if (child.phase === 'starting') {
      return false
    }
    if (deps.childWorkOpen(sessionId) || (await deps.working(sessionId))) {
      return false
    }
    await deps.stop(sessionId)
    return true
  })
}

export type ChatLoginMoveHost = {
  stopAgentBetweenTurns: (sessionId: string) => Promise<boolean>
  subscribeTurnCompletions: (subscriber: {
    id: string
    emit: (event: AgentSessionTurnCompletionEvent) => void
    includeHeld?: boolean
  }) => () => void
}

/** How often a move whose turn ended under background work looks again whether that work is done. */
export const CHAT_LOGIN_MOVE_RETRY_MS = 5_000

const waiting = new Map<string, () => void>()

function stopWaiting(sessionId: string): void {
  waiting.get(sessionId)?.()
  waiting.delete(sessionId)
}

/** The agent stops now when its turn has ended (`next_start`), else when that turn ends, background
 *  work included (`after_work`); either way its next message starts it on the new launch. */
export async function moveChatAgent(
  host: ChatLoginMoveHost,
  sessionId: string,
  retryMs: number = CHAT_LOGIN_MOVE_RETRY_MS
): Promise<'next_start' | 'after_work'> {
  stopWaiting(sessionId)
  if (await host.stopAgentBetweenTurns(sessionId)) {
    return 'next_start'
  }
  let retry: ReturnType<typeof setInterval> | null = null
  const attempt = (): void => {
    void host.stopAgentBetweenTurns(sessionId).then(
      (stopped) => stopped && stopWaiting(sessionId),
      () => {}
    )
  }
  const dispose = host.subscribeTurnCompletions({
    id: `chat-login-move:${sessionId}`,
    includeHeld: true,
    emit: (event) => {
      if (event.type !== 'completion' || event.completion.sessionId !== sessionId) {
        return
      }
      attempt()
      // Background work or a subagent that outlives the turn keeps the agent; look again until it
      // ends (or a new turn starts, whose own end is heard here too).
      retry ??= setInterval(attempt, retryMs)
      retry.unref?.()
    }
  })
  waiting.set(sessionId, () => {
    dispose()
    if (retry) {
      clearInterval(retry)
    }
  })
  return 'after_work'
}
