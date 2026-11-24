import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomically } from '../../../filesystem/atomic-file-publication'
import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'

/** A chat that is back from its terminal and whose waiting messages were not sent yet (local build).
 *  Saved, so an Orca that stops in between sends them at its next start. */
export type StructuredChatReturn = {
  waiting: readonly string[]
  ran: boolean
  /** Its first waiting message went out. */
  sent?: true
}

const FILE = 'structured-chat-returns.json'
let returns: Map<string, StructuredChatReturn> | null = null

function filePath(): string | null {
  try {
    return join(getAppEnvironment().getPath('userData'), FILE)
  } catch {
    return null
  }
}

function isReturn(value: unknown): value is StructuredChatReturn {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every field is checked below.
  const entry = value as Partial<StructuredChatReturn> | null
  return (
    typeof entry === 'object' &&
    entry !== null &&
    Array.isArray(entry.waiting) &&
    entry.waiting.every((id) => typeof id === 'string') &&
    typeof entry.ran === 'boolean'
  )
}

function loaded(): Map<string, StructuredChatReturn> {
  if (returns) {
    return returns
  }
  const path = filePath()
  if (path === null) {
    return new Map()
  }
  returns = new Map()
  try {
    const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
    for (const [sessionId, entry] of Object.entries(saved ?? {})) {
      if (isReturn(entry)) {
        returns.set(sessionId, entry)
      }
    }
  } catch {
    // Absent or unreadable: the cards themselves are in the journal, for the person to send.
  }
  return returns
}

function save(): void {
  const path = filePath()
  if (path === null) {
    return
  }
  try {
    writeFileAtomically(path, JSON.stringify(Object.fromEntries(loaded())))
  } catch (error) {
    console.warn('[chat-terminal] could not save the returned chats', error)
  }
}

export function noteStructuredChatReturn(sessionId: string, entry: StructuredChatReturn): void {
  loaded().set(sessionId, entry)
  save()
}

export function noteStructuredChatReturnSent(sessionId: string, entry: StructuredChatReturn): void {
  if (loaded().get(sessionId) === entry) {
    noteStructuredChatReturn(sessionId, { ...entry, sent: true })
  }
}

export function structuredChatReturn(sessionId: string): StructuredChatReturn | undefined {
  return loaded().get(sessionId)
}

export function structuredChatReturns(): readonly [string, StructuredChatReturn][] {
  return [...loaded()]
}

/** With `only`, not a newer return of the same chat. */
export function takeStructuredChatReturn(
  sessionId: string,
  only?: StructuredChatReturn
): StructuredChatReturn | undefined {
  const entry = loaded().get(sessionId)
  if (only !== undefined && entry !== only) {
    return undefined
  }
  if (loaded().delete(sessionId)) {
    save()
  }
  return entry
}

export function resetStructuredChatReturnsForTests(): void {
  returns = null
}
