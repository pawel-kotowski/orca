import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ChatLaunchProfileSchema,
  type ChatLaunchProfile
} from '../../../shared/agent-launch/contracts/chat-launch-profile'
import { writeFileAtomically } from '../../filesystem/atomic-file-publication'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'
import { getStructuredAgentSessionHost } from '../agent-session-wire/host/structured-agent-session-registry'

export const CHAT_LAUNCH_PROFILES_FILE = 'chat-launch-profiles.json'

/** Each entry read on its own: one a newer or broken writer left is dropped, the others stay. */
function readProfiles(raw: unknown): Record<string, ChatLaunchProfile> {
  const sessions =
    typeof raw === 'object' && raw !== null && 'sessions' in raw ? raw.sessions : undefined
  if (typeof sessions !== 'object' || sessions === null) {
    return {}
  }
  const out: Record<string, ChatLaunchProfile> = {}
  for (const [sessionId, entry] of Object.entries(sessions)) {
    const parsed = ChatLaunchProfileSchema.safeParse(entry)
    if (parsed.success) {
      out[sessionId] = parsed.data
    }
  }
  return out
}

/** `<userData>/chat-launch-profiles.json`, by chat session id: each chat's own launch profile. */
export class ChatLaunchProfiles {
  constructor(private readonly filePath: string) {}

  all(): Record<string, ChatLaunchProfile> {
    try {
      return readProfiles(JSON.parse(readFileSync(this.filePath, 'utf8')))
    } catch {
      return {}
    }
  }

  get(sessionId: string): ChatLaunchProfile | null {
    return this.all()[sessionId] ?? null
  }

  set(sessionId: string, profile: ChatLaunchProfile): void {
    this.write({ ...this.all(), [sessionId]: profile })
  }

  /** Put back what `sessionId` held before (null: nothing). */
  restore(sessionId: string, previous: ChatLaunchProfile | null): void {
    const { [sessionId]: _current, ...sessions } = this.all()
    this.write(previous ? { ...sessions, [sessionId]: previous } : sessions)
  }

  delete(sessionId: string): void {
    const { [sessionId]: dropped, ...sessions } = this.all()
    if (dropped) {
      this.write(sessions)
    }
  }

  private write(sessions: Record<string, ChatLaunchProfile>): void {
    writeFileAtomically(this.filePath, `${JSON.stringify({ sessions }, null, 1)}\n`, {
      mode: 0o600
    })
  }
}

/** Where a chat came from: the sessions a /clear continued into it, and the chat it was forked from. */
export type ChatLineage = {
  clearedFrom: (sessionId: string) => readonly string[]
  forkedFrom: (sessionId: string) => string | null
}

/** A chat's profile, else the nearest one along its /clear and fork lineage: the chat goes on under
 *  a new session id, and its launch must stay the same. */
export function lineageProfile(
  sessionId: string,
  get: (sessionId: string) => ChatLaunchProfile | null,
  lineage: ChatLineage
): ChatLaunchProfile | null {
  const seen = new Set<string>()
  const queue = [sessionId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    const profile = get(id)
    if (profile) {
      return profile
    }
    queue.push(...lineage.clearedFrom(id))
    const source = lineage.forkedFrom(id)
    if (source) {
      queue.push(source)
    }
  }
  return null
}

let shared: ChatLaunchProfiles | null = null

/** The host's profiles, in this Orca profile's data folder. */
export function chatLaunchProfiles(): ChatLaunchProfiles {
  shared ??= new ChatLaunchProfiles(join(getProfileUserDataPath(), CHAT_LAUNCH_PROFILES_FILE))
  return shared
}

/** The launch profile a chat starts with now, its lineage's when it has none of its own. */
export function chatLaunchProfileFor(sessionId: string): ChatLaunchProfile | null {
  const profiles = chatLaunchProfiles().all()
  const store = getStructuredAgentSessionHost()?.deps.store
  return lineageProfile(sessionId, (id) => profiles[id] ?? null, {
    clearedFrom: (id) => store?.listClearedFrom?.(id) ?? [],
    forkedFrom: (id) => store?.getConversation(id)?.forkedFrom?.sessionId ?? null
  })
}

/** Keep a chat's profile before its create starts the agent; the answer undoes it for a create that
 *  was refused, putting back what that session id held (a refused id may name another chat). */
export function keepChatLaunchProfile(
  profiles: Pick<ChatLaunchProfiles, 'get' | 'set' | 'restore'>,
  sessionId: string,
  profile: ChatLaunchProfile | undefined
): () => void {
  if (!profile) {
    return () => {}
  }
  const previous = profiles.get(sessionId)
  profiles.set(sessionId, profile)
  return () => profiles.restore(sessionId, previous)
}

/** A create that throws before its chat exists made no chat: put back what its id held. */
export async function undoProfileIfCreateThrows<T>(
  create: () => Promise<T>,
  undo: () => void,
  chatExists: () => boolean
): Promise<T> {
  try {
    return await create()
  } catch (error) {
    if (!chatExists()) {
      undo()
    }
    throw error
  }
}
