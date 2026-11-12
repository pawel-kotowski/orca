import { overlayEnvironmentVariables } from '../../environment-overlay'

export const CLAUDE_ENTRYPOINT_ENV = 'CLAUDE_CODE_ENTRYPOINT'
const ORCA_CLAUDE_CHAT_ENTRYPOINT = 'orca'
/** What `claude -p` records as a transcript's entrypoint; its one-shot sessions are not conversations to resume. */
export const CLAUDE_PRINT_MODE_ENTRYPOINT = 'sdk-cli'

/** Only structured chats own this identity; other Claude processes retain their CLI default. */
export function withOrcaClaudeChatEntrypoint(
  env: Readonly<Record<string, string>>,
  platform: NodeJS.Platform
): Record<string, string> {
  return overlayEnvironmentVariables(
    env,
    { [CLAUDE_ENTRYPOINT_ENV]: ORCA_CLAUDE_CHAT_ENTRYPOINT },
    platform
  )
}
