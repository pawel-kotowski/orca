// After a usage-limit account switch, Claude restarts on the new account and resumes the chat;
// Continue is typed only once that restarted Claude is there to read it.

/** What the person asked for: continue this cut once the pane's Claude has restarted. */
export type NativeChatContinueAfterSwitch = {
  turnItemId: string
  /** The PTY the switch queued for restart. */
  oldPtyId: string
  armedAt: number
  /** The account's short name, for the row while it waits. */
  accountName: string
  /** The restarted PTY and when this chat first saw it. */
  newPty?: { ptyId: string; seenAt: number }
}

export type NativeChatContinueAfterSwitchObserved = {
  /** The chat's current cut, or null while none shows (still reading, or something was sent). */
  cutTurnItemId: string | null
  /** The pane's PTY now. */
  ptyId: string | null
  /** The old PTY still waits for its restart. */
  restartQueued: boolean
  /** The pane's agent status, as its hooks last reported it. */
  status: { state: string; updatedAt: number } | null
}

export type NativeChatContinueAfterSwitchStep =
  | { kind: 'wait'; until?: number }
  | { kind: 'send' }
  | { kind: 'abandon' }

/** A switch whose restart never came (the turn never ended, the pane closed) stops waiting. */
export const CONTINUE_AFTER_SWITCH_MAX_WAIT_MS = 15 * 60_000
/** Claude reports its new session before its prompt takes input; give the box a moment. */
export const CONTINUE_AFTER_SWITCH_SETTLE_MS = 1_500
/** A restarted Claude whose start hook this watcher missed still gets Continue. */
export const CONTINUE_AFTER_SWITCH_FALLBACK_MS = 8_000

/** Notes the restarted PTY the first time this chat sees it; the same record otherwise. */
export function withNewPtySeen(
  armed: NativeChatContinueAfterSwitch,
  ptyId: string | null,
  now: number
): NativeChatContinueAfterSwitch {
  return ptyId === null || ptyId === armed.oldPtyId || armed.newPty?.ptyId === ptyId
    ? armed
    : { ...armed, newPty: { ptyId, seenAt: now } }
}

export function nativeChatContinueAfterSwitchStep(
  armed: NativeChatContinueAfterSwitch,
  observed: NativeChatContinueAfterSwitchObserved,
  now: number
): NativeChatContinueAfterSwitchStep {
  if (now - armed.armedAt > CONTINUE_AFTER_SWITCH_MAX_WAIT_MS) {
    return { kind: 'abandon' }
  }
  // A newer limit is a new question for the person, not the one they answered.
  if (observed.cutTurnItemId !== null && observed.cutTurnItemId !== armed.turnItemId) {
    return { kind: 'abandon' }
  }
  if (observed.restartQueued || observed.ptyId === null || observed.ptyId === armed.oldPtyId) {
    return { kind: 'wait' }
  }
  const seenAt = armed.newPty?.ptyId === observed.ptyId ? armed.newPty.seenAt : null
  if (seenAt === null || observed.status?.state === 'working') {
    return { kind: 'wait' }
  }
  // Only the cut itself is continued: a message the person sent meanwhile hides it, and so does
  // a transcript still being read after the restart.
  if (observed.cutTurnItemId === null) {
    return { kind: 'wait' }
  }
  const started =
    observed.status && observed.status.updatedAt >= seenAt
      ? observed.status.updatedAt + CONTINUE_AFTER_SWITCH_SETTLE_MS
      : seenAt + CONTINUE_AFTER_SWITCH_FALLBACK_MS
  return now >= started ? { kind: 'send' } : { kind: 'wait', until: started }
}
