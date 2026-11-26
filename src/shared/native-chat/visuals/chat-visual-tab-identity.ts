import { isNativeChatVisualFileName } from './native-chat-visual-directive'

/** Which chat visual a popped-out tab shows: the page of one chat session on one host, opened from one chat tab. */
export type ChatVisualTabIdentity = {
  /** The paired host the chat runs on; null for this computer. */
  environmentId: string | null
  sessionId: string
  /** The visual's bare file name in that chat's scratch folder. */
  file: string
  /** The chat tab it came from: its code links open beside that chat. */
  chatTabId: string
  title: string | null
}

const PREFIX = 'chat-visual::'

/** The tab's file id; it carries the whole identity, so a saved tab bar can reopen it after a restart. */
export function chatVisualTabFileId(identity: ChatVisualTabIdentity): string {
  return `${PREFIX}${encodeURIComponent(
    JSON.stringify([
      identity.environmentId,
      identity.sessionId,
      identity.file,
      identity.chatTabId,
      identity.title
    ])
  )}`
}

function stringOrNull(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value : undefined
}

export function parseChatVisualTabFileId(fileId: string): ChatVisualTabIdentity | null {
  if (!fileId.startsWith(PREFIX)) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(fileId.slice(PREFIX.length)))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    return null
  }
  const fields: unknown[] = parsed
  const [environmentId, sessionId, file, chatTabId, title] = fields
  const env = stringOrNull(environmentId)
  const heading = stringOrNull(title)
  if (
    env === undefined ||
    heading === undefined ||
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    typeof file !== 'string' ||
    !isNativeChatVisualFileName(file) ||
    typeof chatTabId !== 'string'
  ) {
    return null
  }
  return { environmentId: env, sessionId, file, chatTabId, title: heading }
}
