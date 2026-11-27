import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

export const CHAT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['chat', 'send'],
    // `--worker <structworker_…>` in place of --session names a chat worker (`orca orchestration worker-list`).
    summary: 'Send a message to a chat, as if typed in it',
    usage: 'orca chat send --session <id> --text <text> [--queue] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'worker', 'text', 'queue'],
    notes: [
      'A chat whose agent is in a turn takes the message the way its message box does while it works (it steers the turn); --queue holds it until the turn ends.',
      'A chat whose agent stopped (asleep, after an Orca restart, after `orca chat login`) starts it again, resumed, for the message.',
      'send, compact, stop, show, profile and login also take a chat worker as --worker <structworker_…> (its `terminal` in `orca orchestration worker-list`) in place of --session.'
    ],
    examples: ['orca chat send --session <sessionId> --text "Run the tests" --json']
  },
  {
    path: ['chat', 'compact'],
    summary: "Compact a chat's conversation, as /compact does",
    usage: 'orca chat compact --session <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'worker'],
    notes: ['A chat in a turn compacts when that turn ends.'],
    examples: ['orca chat compact --session <sessionId>']
  },
  {
    path: ['chat', 'stop'],
    summary: "Stop a chat's running turn, as Esc does",
    usage: 'orca chat stop --session <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'worker'],
    notes: ['The chat stays open; its next message goes on from there.'],
    examples: ['orca chat stop --session <sessionId>']
  },
  {
    path: ['chat', 'close'],
    summary: 'Close a chat and stop its agent',
    usage: 'orca chat close --session <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session'],
    notes: ['The same as closing its tab: Session History can reopen it.'],
    examples: ['orca chat close --session <sessionId>']
  },
  {
    path: ['chat', 'delete'],
    summary: 'Delete a chat, as its Delete chat does',
    usage: 'orca chat delete --session <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session'],
    notes: [
      'The chat leaves Orca (tabs, Session History); the agent’s own transcript stays, so `orca agent launch --resume <its Claude session id>` can continue that conversation in a new chat, under the same session id.',
      'Refused for a chat with open workers, a bot’s home, and on a paired host other than its owner’s.'
    ],
    examples: ['orca chat delete --session <sessionId>']
  },
  {
    path: ['chat', 'show'],
    summary: "Show a chat's state, usage limit, login and conversation id",
    usage: 'orca chat show --session <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'worker'],
    notes: [
      '`state`: `working` in a turn, `idle` waiting for a message, `stopped` with no agent running (its next message starts one).',
      "`usageLimit`: set when its latest turn ended at the login's usage limit, with the reset time when Claude gave one.",
      '`claudeConfigDir`: the login its agent runs on, else the one its next start takes. `providerSessionId`: the Claude session id of its conversation. `launchEnv`: the names of the variables its launch profile adds.'
    ],
    examples: ['orca chat show --session <sessionId> --json']
  },
  {
    path: ['chat', 'profile'],
    summary: "Replace a chat's launch profile",
    usage:
      'orca chat profile --session <id> [--chat-profile <json>] [--claude-config-dir <dir>] [--append-system-prompt-file <file>] [--env KEY=VALUE]... [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'session',
      'worker',
      'chat-profile',
      'claude-config-dir',
      'append-system-prompt-file',
      'env'
    ],
    repeatableFlags: ['env'],
    notes: [
      'The same profile flags as `orca agent launch --surface chat`; the profile given replaces the whole one the chat had.',
      'An idle or limit-stopped agent stops now and starts with the new profile, resumed, at its next message. An agent in a turn finishes it first: `after_work`.'
    ],
    examples: [
      'orca chat profile --session <sessionId> --claude-config-dir ~/.claude-logins/backup --append-system-prompt-file ./system.md'
    ]
  },
  {
    path: ['chat', 'login'],
    summary: "Move a chat's agent to another Claude login",
    usage: 'orca chat login --session <id> --claude-config-dir <dir> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'worker', 'claude-config-dir'],
    notes: [
      "--claude-config-dir is the Claude config folder of the login (`~/.claude`, `~/.claude-logins/<name>`, an Orca account home). It is kept in the chat's launch profile.",
      'An idle or limit-stopped agent stops now and starts on the new login, resumed, with the next message (`orca chat send`). An agent in a turn finishes it first: `after_work`.',
      'The login must be able to read the conversation: the folders share their `projects` folder, or the conversation is new.'
    ],
    examples: ['orca chat login --session <sessionId> --claude-config-dir ~/.claude-logins/backup']
  },
  {
    path: ['chat', 'rename'],
    summary: 'Rename a chat tab',
    usage: 'orca chat rename [--session <id>] --name <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'name'],
    notes: [
      '--session takes the chat session id `orca agent launch` prints. Run inside a chat, it defaults to that chat; with --environment it is required.',
      'The name shows in the tab, the sidebar, Session History and on paired phones, the same as renaming the tab by hand.'
    ],
    examples: [
      'orca chat rename --name "Migrate auth to OAuth"',
      'orca chat rename --session <sessionId> --name "Release notes" --json'
    ]
  }
]
