import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  ChatLaunchProfileSchema,
  type ChatLaunchProfile
} from '../../../shared/agent-launch/contracts/chat-launch-profile'
import { writeFileAtomically } from '../../filesystem/atomic-file-publication'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'

export const CHAT_LAUNCH_PROFILES_FILE = 'chat-launch-profiles.json'

const ProfilesFile = z.object({
  sessions: z.record(z.string(), ChatLaunchProfileSchema)
})

/** `<userData>/chat-launch-profiles.json`, by chat session id: each chat's own launch profile. */
export class ChatLaunchProfiles {
  constructor(private readonly filePath: string) {}

  all(): Record<string, ChatLaunchProfile> {
    try {
      return ProfilesFile.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))).sessions
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

let shared: ChatLaunchProfiles | null = null

/** The host's profiles, in this Orca profile's data folder. */
export function chatLaunchProfiles(): ChatLaunchProfiles {
  shared ??= new ChatLaunchProfiles(join(getProfileUserDataPath(), CHAT_LAUNCH_PROFILES_FILE))
  return shared
}
