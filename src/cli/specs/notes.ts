import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

const NOTES_FLAGS = [...GLOBAL_FLAGS, 'worktree']
const WORKSPACE_NOTE =
  "Notes belong to the workspace (inferred from cwd, or --worktree): the user's notes on code lines in any editor tab, on diff lines, on markdown, and on parts of chat visuals (HTML pages shown in chat)."
const ID_NOTE =
  'A note is named by its id as `orca notes list` prints it (the first 8 characters are enough).'

export const NOTES_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['notes', 'list'],
    summary: "List the user's notes (comments) in this workspace, with their threads",
    usage: 'orca notes list [--file <path>] [--all] [--worktree <selector>] [--json]',
    allowedFlags: [...NOTES_FLAGS, 'file', 'all'],
    notes: [
      WORKSPACE_NOTE,
      "Each note prints its id, where it is (path:lines, or a visual file and the part of it: a CSS selector, the code the part shows), the text it was left on, the user's comment and its replies. Resolved notes are left out unless --all. --file keeps the notes on one file or visual (a path, or a visual's file name)."
    ],
    examples: ['orca notes list', 'orca notes list --file flow.html --json']
  },
  {
    path: ['notes', 'reply'],
    summary: 'Answer a note on its own thread; the reply shows on the note in Orca',
    usage: 'orca notes reply <id> --body "<text>" [--worktree <selector>] [--json]',
    allowedFlags: [...NOTES_FLAGS, 'id', 'body'],
    positionalArgs: ['id'],
    notes: [
      ID_NOTE,
      'The reply is signed as the agent. Answer in chat instead when the answer is long or covers several notes.'
    ],
    examples: [
      'orca notes reply 3f2a9c1d --body "Yes: this box is the retry loop in queue.ts:40-62."'
    ]
  },
  {
    path: ['notes', 'resolve'],
    summary: 'Mark a note done (or --reopen it)',
    usage: 'orca notes resolve <id> [--reopen] [--worktree <selector>] [--json]',
    allowedFlags: [...NOTES_FLAGS, 'id', 'reopen'],
    positionalArgs: ['id'],
    notes: [
      ID_NOTE,
      'A resolved note stays, folded, with its thread; `orca notes list` leaves it out.'
    ],
    examples: ['orca notes resolve 3f2a9c1d']
  },
  {
    path: ['notes', 'clear'],
    summary: "Remove notes: all of them, one file's, or only resolved ones",
    usage: 'orca notes clear [--file <path>] [--resolved] [--worktree <selector>] [--json]',
    allowedFlags: [...NOTES_FLAGS, 'file', 'resolved'],
    notes: [
      WORKSPACE_NOTE,
      'Removes them for the user too; resolve a note instead when they may still want to read it.'
    ],
    examples: ['orca notes clear --resolved', 'orca notes clear --file flow.html']
  }
]
