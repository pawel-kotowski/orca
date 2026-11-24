import { expect, it } from 'vitest'
import { commandResumesConversation } from './structured-chat-conversation-command'

const ID = 'ce489453-5f6c-4b04-bd51-b00646a38a10'

it.each([
  `claude '--dangerously-skip-permissions' '--resume' '${ID}'`,
  `claude --plugin-dir '/Users/x/Application Support/o' '--resume' '${ID}'`,
  `claude --plugin-dir /Users/x/Application Support/o --resume ${ID}`,
  `claude --resume=${ID}`,
  `claude -r ${ID}`,
  `claude -r${ID}`,
  `claude --resume '${ID}'; exec zsh`,
  `claude --resume /x/${ID}.jsonl`,
  `codex --no-daemon -c a.b='c d' 'resume' '${ID}'`,
  `codex -c tui.resume_cwd=current resume ${ID}`,
  `codex exec resume ${ID}`,
  `codex resume --add-dir /a b ${ID}`,
  `codex resume ${ID} fix the fork bug`,
  `node /usr/local/bin/codex resume ${ID}`,
  `codex --cd /Users/p/My Project resume ${ID}`,
  `/opt/codex-aarch64-apple-darwin resume ${ID}`,
  `codex e resume ${ID}`,
  `cd /x && claude --resume ${ID}`,
  `claude --append-system-prompt don't; stop --resume ${ID}`,
  `agy --conversation ${ID}`,
  `pi --session /x/2026_${ID}.jsonl`
])('resumes it: %s', (command) => {
  expect(commandResumesConversation(command, ID)).toBe(true)
})

it.each([
  `claude --resume ${ID} --fork-session`,
  `codex fork ${ID}`,
  `codex --no-daemon 'fork' '${ID}'`,
  `codex please look at ${ID} and resume`,
  `claude 'Read /tmp/${ID}/scratchpad/brief.md'`,
  `claude Read /tmp/${ID}/scratchpad/brief.md and resume`,
  `claude --resume ${ID}0`
])('does not: %s', (command) => {
  expect(commandResumesConversation(command, ID)).toBe(false)
})
