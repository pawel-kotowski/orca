import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomically } from '../../filesystem/atomic-file-publication'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'

/** `<userData>/chat-scratch-inheritance.json`: a chat that took a closed chat's conversation over
 *  keeps that chat's scratch folder (Claude's environment names it), even after the old chat is
 *  deleted. {new chat session id: the chat whose folder it uses}. */
export class ChatScratchInheritance {
  constructor(private readonly filePath: string) {}

  all(): Record<string, string> {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const sessions =
        typeof raw === 'object' && raw !== null && 'sessions' in raw ? raw.sessions : {}
      return Object.fromEntries(
        Object.entries(typeof sessions === 'object' && sessions !== null ? sessions : {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      )
    } catch {
      return {}
    }
  }

  /** The chat whose folder `sessionId` uses: its source's source, and so on. */
  source(sessionId: string): string {
    const map = this.all()
    const seen = new Set<string>()
    let current = sessionId
    while (map[current] && !seen.has(current)) {
      seen.add(current)
      current = map[current]!
    }
    return current
  }

  set(sessionId: string, from: string): void {
    this.write({ ...this.all(), [sessionId]: from })
  }

  delete(sessionId: string): void {
    const { [sessionId]: dropped, ...rest } = this.all()
    if (dropped) {
      this.write(rest)
    }
  }

  private write(sessions: Record<string, string>): void {
    writeFileAtomically(this.filePath, `${JSON.stringify({ sessions }, null, 1)}\n`, {
      mode: 0o600
    })
  }
}

let shared: ChatScratchInheritance | null = null

export function chatScratchInheritance(): ChatScratchInheritance {
  shared ??= new ChatScratchInheritance(
    join(getProfileUserDataPath(), 'chat-scratch-inheritance.json')
  )
  return shared
}
