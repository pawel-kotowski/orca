import type { CommandSpec } from '../discovery/command-spec'
import { LOCAL_COMMAND_FLAGS } from '../arguments/args'

export const MOVE_TO_INBOX_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['move-to-inbox'],
    summary: "Move this agent's card into the user's Orca Inbox with a message",
    usage: 'orca move-to-inbox --message <text> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'message'],
    notes: [
      'Run it from the agent terminal Orca started: it names that pane from ORCA_PANE_KEY and reaches the Orca on the same machine.',
      'The card goes to the Inbox every time, with the message as its text, and stays until the user clears it. While an agent keeps working (a server, a watcher, workers or subagents still running) this is the only way its card reaches the Inbox, apart from a question or an approval.'
    ],
    examples: ['orca move-to-inbox --message "All four lots merged; the deploy is live"']
  }
]
