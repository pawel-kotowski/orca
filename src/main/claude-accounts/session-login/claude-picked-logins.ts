import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { writeFileAtomically } from '../../filesystem/atomic-file-publication'

/** The login a person picked for a session, and whether the move still waits for its turn to end. */
export type ClaudePickedLogin = z.infer<typeof PickedLogin>

const PickedLogin = z.object({
  configDir: z.string(),
  pickedAt: z.number(),
  /** The terminal of a move that waits for the running turn. */
  pendingTerminal: z.string().optional(),
  /** What its Claude was last started with, for a start after it ended (a box that rebooted). */
  argv: z.array(z.string()).optional()
})
const PickedLoginsFile = z.object({ sessions: z.record(z.string(), PickedLogin) })

export const CLAUDE_PICKED_LOGINS_FILE = 'claude-picked-logins.json'

/**
 * `<userData>/claude-picked-logins.json`, by session id. A box's `limit-move` reads it too: it
 * moves sessions between logins by their limits, and must not undo what a person picked.
 */
export class ClaudePickedLogins {
  constructor(private readonly filePath: string) {}

  all(): Record<string, ClaudePickedLogin> {
    try {
      return PickedLoginsFile.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))).sessions
    } catch {
      return {}
    }
  }

  set(sessionId: string, pick: ClaudePickedLogin): void {
    this.write({ ...this.all(), [sessionId]: pick })
  }

  settle(sessionId: string): void {
    const sessions = this.all()
    const pick = sessions[sessionId]
    if (pick?.pendingTerminal) {
      const { pendingTerminal: _settled, ...rest } = pick
      this.write({ ...sessions, [sessionId]: rest })
    }
  }

  restore(sessionId: string, previous: ClaudePickedLogin | undefined): void {
    const { [sessionId]: _dropped, ...sessions } = this.all()
    this.write(previous ? { ...sessions, [sessionId]: previous } : sessions)
  }

  private write(sessions: Record<string, ClaudePickedLogin>): void {
    writeFileAtomically(this.filePath, `${JSON.stringify({ sessions }, null, 1)}\n`, {
      mode: 0o600
    })
  }
}
