/** What one chat's agent starts with beyond Orca's own launch: kept per chat and applied at every
 *  start of it (a resume after the agent stopped, a restart of Orca, a move to another login). */

import * as z from 'zod'

const MAX_PATH = 4096
const MAX_ENTRIES = 256
const MAX_VALUE = 32_768

export const ChatLaunchProfilePath = z
  .string()
  .min(1)
  .max(MAX_PATH)
  .refine((value) => value.startsWith('/') && !/[\0\r\n]/.test(value), 'Not an absolute path')

/** Variables Orca owns for the chat's agent; a profile names its login with `claudeConfigDir`. */
const RESERVED_ENV = new Set(['CLAUDE_CONFIG_DIR', 'CODEX_HOME'])

export const ChatLaunchProfileSchema = z
  .object({
    /** Agent CLI arguments after the configured ones (Claude: `--settings <file>`, `--model`, …). */
    args: z.array(z.string().max(MAX_VALUE)).max(MAX_ENTRIES).optional(),
    /** Added to the agent's environment. */
    env: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(MAX_VALUE))
      .refine((env) => Object.keys(env).length <= MAX_ENTRIES, 'Too many variables')
      .refine(
        (env) => Object.keys(env).every((key) => !RESERVED_ENV.has(key)),
        'Name the login with claudeConfigDir, not the environment'
      )
      .optional(),
    /** Read at every start and appended to the system prompt, as `--append-system-prompt-file`. */
    appendSystemPromptFile: ChatLaunchProfilePath.optional(),
    /** The Claude config folder (login) the agent runs on, in place of the workspace's account. */
    claudeConfigDir: ChatLaunchProfilePath.optional()
  })
  .strict()

export type ChatLaunchProfile = z.infer<typeof ChatLaunchProfileSchema>

export function isEmptyChatLaunchProfile(profile: ChatLaunchProfile): boolean {
  return (
    !profile.args?.length &&
    !Object.keys(profile.env ?? {}).length &&
    !profile.appendSystemPromptFile &&
    !profile.claudeConfigDir
  )
}
