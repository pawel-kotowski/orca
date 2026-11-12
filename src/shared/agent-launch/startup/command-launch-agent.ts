import type { TuiAgent } from '../catalog/tui-agent'

/**
 * The agent a terminal's startup command launches, when the request named none: `orca terminal
 * create --command 'claude …'` (or a wrapper such as `claude-as <account>`) runs Claude as surely
 * as `orca agent launch` does, so it follows "Open CLI agents in Chat UI" too. Only the command's
 * first word counts (after `VAR=value` assignments and `exec`/`env`), so a shell that merely
 * mentions claude later stays a terminal.
 */
export function launchAgentFromCommand(command: string | null | undefined): TuiAgent | undefined {
  const words = command?.trim().split(/\s+/) ?? []
  const first = words.find(
    (word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && word !== 'exec' && word !== 'env'
  )
  const name = first
    ?.replace(/^['"]|['"]$/g, '')
    .split('/')
    .pop()
  if (!name) {
    return undefined
  }
  if (name === 'claude' || /^claude-(as|robotec|mos|personal)$/.test(name)) {
    return 'claude'
  }
  return name === 'codex' ? 'codex' : undefined
}
