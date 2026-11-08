import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Interactive Claude asks once whether to use an `ANTHROPIC_API_KEY` found in the environment and
 * remembers the answer in `.claude.json` (`customApiKeyResponses`, by the key's last 20
 * characters). One-shot `claude -p` runs never ask: they use the key, so a key the person
 * rejected (often a stale one in a shell profile) made every Orca generation fail with
 * "Invalid API key" while their terminal agents ran on the Claude login. A generation honours the
 * same answer: a rejected key is left out, and Claude falls back to the account's login.
 */
export function withoutRejectedClaudeApiKey(
  env: NodeJS.ProcessEnv,
  readConfig: (path: string) => string = (path) => readFileSync(path, 'utf8')
): NodeJS.ProcessEnv {
  const key = env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    return env
  }
  const configDir = env.CLAUDE_CONFIG_DIR?.trim()
  const configPath = configDir
    ? join(configDir, '.claude.json')
    : join(env.HOME || homedir(), '.claude.json')
  let rejected: unknown
  try {
    const config = JSON.parse(readConfig(configPath)) as {
      customApiKeyResponses?: { rejected?: unknown }
    }
    rejected = config.customApiKeyResponses?.rejected
  } catch {
    return env
  }
  if (!Array.isArray(rejected) || !rejected.includes(key.slice(-20))) {
    return env
  }
  const { ANTHROPIC_API_KEY: _rejected, ...rest } = env
  return rest
}
