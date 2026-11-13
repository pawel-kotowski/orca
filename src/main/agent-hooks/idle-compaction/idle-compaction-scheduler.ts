import type { EnrichedAgentHookEventPayload } from '../server/server-types'
import {
  isIdleCompactionAgent,
  type IdleCompactionAgent,
  type IdleCompactionSessionFacts
} from './idle-compaction-session-facts'

/**
 * Orca's own idle compaction for terminal agents (Claude Code, Codex, oh-my-pi, pi).
 *
 * Claude Code compacts a long conversation by itself 54 minutes into an idle pause (90% of its
 * one-hour prompt cache), but skips it whenever its rate-limit status is not "allowed", and that
 * status turns to a warning for an org's extra-usage threshold alone (2026-11-13: a Team account
 * at 8% of its 5-hour limit never idle-compacted, anthropics/claude-code#108789). The other agents
 * never compact while idle. So after a turn ends Orca waits until 57 minutes (after Claude's own
 * attempt, still inside its cache), and if the conversation is still large and was not compacted,
 * types `/compact` the way orchestration mail is typed: never over a draft, a dialog or a prompt.
 * A manual compaction keeps the row's turn start, so the card's read state does not change.
 */

export const IDLE_COMPACTION_DELAY_MS = 57 * 60_000
/** Past this the cache is gone (a sleeping laptop): compacting would reread everything. */
export const IDLE_COMPACTION_LATE_LIMIT_MS = 2.5 * 60_000
export const IDLE_COMPACTION_MIN_TOKENS = 200_000

export type IdleCompactionOutcome =
  | 'compacted'
  | 'disabled'
  | 'lapsed'
  | 'superseded'
  | 'small'
  | 'already_compacted'
  | 'short_cache'
  | 'no_usage'
  | 'no_terminal'
  | 'held'
  | 'unreadable'
  | 'send_failed'

export type IdleCompactionDeps = {
  now: () => number
  setTimer: (run: () => void, ms: number) => { cancel: () => void }
  minTokens: number
  /** False turns the feature off for this agent's session (Claude's own `idleCompaction: false`). */
  allowedBySettings: (agent: IdleCompactionAgent, transcriptPath: string) => Promise<boolean>
  readFacts: (
    agent: IdleCompactionAgent,
    transcriptPath: string,
    since: number
  ) => Promise<IdleCompactionSessionFacts>
  /** The pane's terminal, or null when this runtime does not own it. */
  terminalHandle: (paneKey: string) => string | null
  /** Why typing now would be unsafe (draft, dialog, prompt, unsettled screen); null when it is not. */
  inputHold: (handle: string) => string | null
  sendCompact: (handle: string, agent: IdleCompactionAgent) => Promise<void>
  log: (line: string) => void
}

type Armed = {
  agent: IdleCompactionAgent
  transcriptPath: string
  turnEndedAt: number
  /** The pane's event count when armed; any later event means the agent moved on. */
  seq: number
  timer: { cancel: () => void }
}

export class IdleCompactionScheduler {
  private readonly armed = new Map<string, Armed>()
  /** Turns already handled per pane, so a re-emitted done row (our own compaction's) never re-arms. */
  private readonly handledTurn = new Map<string, number>()
  private readonly seqByPane = new Map<string, number>()

  constructor(private readonly deps: IdleCompactionDeps) {}

  onStatus(event: EnrichedAgentHookEventPayload): void {
    // Facets and identity refreshes say nothing about the turn.
    if (event.programStatusOnly || event.providerSessionOnly) {
      return
    }
    const { paneKey } = event
    const turnEndedAt = event.turnEndedAt ?? event.stateStartedAt
    const current = this.armed.get(paneKey)
    if (current && current.turnEndedAt === turnEndedAt && event.payload.state === 'done') {
      return
    }
    const seq = (this.seqByPane.get(paneKey) ?? 0) + 1
    this.seqByPane.set(paneKey, seq)
    this.cancel(paneKey)
    const agent = event.payload.agentType ?? event.source
    const transcriptPath = event.providerSession?.transcriptPath
    if (
      event.payload.state !== 'done' ||
      event.restoredUnconfirmed ||
      event.structuredHost ||
      event.isReplay ||
      // Relayed from another host: that host compacts its own panes.
      event.connectionId !== null ||
      !isIdleCompactionAgent(agent) ||
      !transcriptPath ||
      this.handledTurn.get(paneKey) === turnEndedAt
    ) {
      return
    }
    const wait = turnEndedAt + IDLE_COMPACTION_DELAY_MS - this.deps.now()
    if (wait < -IDLE_COMPACTION_LATE_LIMIT_MS) {
      return
    }
    const timer = this.deps.setTimer(() => void this.fire(paneKey, turnEndedAt), Math.max(0, wait))
    this.armed.set(paneKey, { agent, transcriptPath, turnEndedAt, seq, timer })
  }

  /** The pane's terminal closed or its agent left. */
  forget(paneKey: string): void {
    this.cancel(paneKey)
    this.handledTurn.delete(paneKey)
    this.seqByPane.delete(paneKey)
  }

  dispose(): void {
    for (const paneKey of this.armed.keys()) {
      this.cancel(paneKey)
    }
  }

  private cancel(paneKey: string): void {
    this.armed.get(paneKey)?.timer.cancel()
    this.armed.delete(paneKey)
  }

  private async fire(paneKey: string, turnEndedAt: number): Promise<void> {
    const armed = this.armed.get(paneKey)
    if (!armed || armed.turnEndedAt !== turnEndedAt) {
      return
    }
    this.armed.delete(paneKey)
    this.handledTurn.set(paneKey, turnEndedAt)
    const outcome = await this.decideAndSend(paneKey, armed).catch(
      (): IdleCompactionOutcome => 'unreadable'
    )
    this.deps.log(
      `${new Date(this.deps.now()).toISOString()} ${outcome} agent=${armed.agent} pane=${paneKey} idleMin=${Math.round((this.deps.now() - turnEndedAt) / 60_000)}`
    )
  }

  private async decideAndSend(paneKey: string, armed: Armed): Promise<IdleCompactionOutcome> {
    const { agent, transcriptPath, turnEndedAt } = armed
    if (this.deps.now() - turnEndedAt > IDLE_COMPACTION_DELAY_MS + IDLE_COMPACTION_LATE_LIMIT_MS) {
      return 'lapsed'
    }
    if (!(await this.deps.allowedBySettings(agent, transcriptPath))) {
      return 'disabled'
    }
    const facts = await this.deps.readFacts(agent, transcriptPath, turnEndedAt)
    if (facts.compactedSince) {
      return 'already_compacted'
    }
    if (facts.contextTokens === null) {
      return 'no_usage'
    }
    if (facts.contextTokens < this.deps.minTokens) {
      return 'small'
    }
    // A five-minute cache expired long ago; compacting would resend everything uncached.
    if (agent === 'claude' && facts.cacheTtl === '5m') {
      return 'short_cache'
    }
    // The agent moved on (a new turn, a question) while the file was read.
    if (this.seqByPane.get(paneKey) !== armed.seq) {
      return 'superseded'
    }
    const handle = this.deps.terminalHandle(paneKey)
    if (!handle) {
      return 'no_terminal'
    }
    const hold = this.deps.inputHold(handle)
    if (hold) {
      return 'held'
    }
    try {
      await this.deps.sendCompact(handle, agent)
      return 'compacted'
    } catch {
      return 'send_failed'
    }
  }
}
