import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli-argument-boundary'

const SHOW_FLAGS = [...GLOBAL_FLAGS, 'worktree', 'no-focus']
const PATH_NOTE =
  'A relative path names the file seen from your shell folder when it exists there, else from the worktree root; absolute paths must be inside the worktree. A missing file fails with file_not_found. When --worktree is omitted, the worktree is inferred from cwd.'
const OWNER_NOTE =
  "Marks belong to the agent's tab (ORCA_TAB_ID), so `orca show clear` removes only your own. Showing brings the user to it; --no-focus leaves the view alone."
const NO_WINDOW_NOTE =
  'A server with no app window (`orca serve`) cannot show anything, so this fails with renderer_unavailable.'

export const SHOW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['show', 'code'],
    summary: 'Show the user a line range of a file, highlighted, with an optional note',
    usage:
      'orca show code <path> --lines <a>-<b> [--note "<text>"] [--mark <n>] [--place beside|right|below|same] [--keep] [--worktree <selector>] [--no-focus] [--json]',
    allowedFlags: [...SHOW_FLAGS, 'path', 'lines', 'note', 'mark', 'place', 'keep'],
    positionalArgs: ['path'],
    notes: [
      '--lines 42 means line 42 only. Code opens in a column beside your chat, never over it: beside/same reuse your current pane there, below stacks a new pane and right adds a column, each only when every pane still shows its range (else your least recent pane is reused and the result says which). Each editor shrinks its font (not below 11px) to fit; the result prints `fits: 18/18 lines at 12px`. A new show closes the tabs your earlier one opened unless --keep.',
      PATH_NOTE,
      OWNER_NOTE,
      NO_WINDOW_NOTE
    ],
    examples: [
      'orca show code src/main/index.ts --lines 40-62 --note "Startup wiring" --mark 1',
      'orca show code src/app.ts --lines 12 --place right --keep'
    ]
  },
  {
    path: ['show', 'tree'],
    summary: 'Light up files and folders in the file explorer, with optional labels',
    usage:
      'orca show tree <path>... [--label "<path>=<label>"]... [--no-expand] [--dim-others] [--worktree <selector>] [--no-focus] [--json]',
    allowedFlags: [...SHOW_FLAGS, 'path', 'label', 'no-expand', 'dim-others'],
    positionalArgs: ['path'],
    variadicPositional: true,
    repeatableFlags: ['path', 'label'],
    notes: [
      'Each --label names one of the paths exactly as typed. Folders open unless --no-expand; --dim-others fades every row not shown.',
      PATH_NOTE,
      OWNER_NOTE
    ],
    examples: [
      'orca show tree src/cli src/main --label "src/cli=CLI side" --label "src/main=main process"',
      'orca show tree src/renderer/src/agent-show --dim-others'
    ]
  },
  {
    path: ['show', 'file'],
    summary: 'Open a file for the user beside your tab, as source or as a preview',
    usage:
      'orca show file <path> [--preview] [--place beside|right|below|same] [--worktree <selector>] [--no-focus] [--json]',
    allowedFlags: [...SHOW_FLAGS, 'path', 'preview', 'place'],
    positionalArgs: ['path'],
    notes: ['--preview renders Markdown and images instead of their source.', PATH_NOTE],
    examples: ['orca show file docs/design.md --preview']
  },
  {
    path: ['show', 'ui'],
    summary: 'Highlight an element on a browser page, optionally linked to the code behind it',
    usage:
      'orca show ui (--selector <css> | --ref <@e3> | --text "<text>") [--page <id>] [--note "<text>"] [--mark <n>] [--code <path>:<a>-<b>] [--worktree <selector>] [--no-focus] [--json]',
    allowedFlags: [...SHOW_FLAGS, 'selector', 'ref', 'text', 'page', 'note', 'mark', 'code'],
    notes: [
      "Pass exactly one of --selector, --ref (from `orca snapshot`) or --text. --page picks the browser page; the worktree's current page otherwise.",
      OWNER_NOTE
    ],
    examples: [
      'orca show ui --text "Sign in" --note "This button posts to /login" --code src/auth/login.ts:20-48'
    ]
  },
  {
    path: ['show', 'clear'],
    summary: 'Remove your own highlights, notes and labels',
    usage: 'orca show clear [--code|--tree|--ui|--all] [--worktree <selector>] [--json]',
    allowedFlags: [...SHOW_FLAGS, 'code', 'tree', 'ui', 'all'],
    notes: ["Without a flag it clears all three. Other agents' and the user's marks stay."],
    examples: ['orca show clear', 'orca show clear --tree']
  },
  {
    path: ['show', 'state'],
    summary: 'What the user sees: layout, your tab, editors, explorer, browser marks',
    usage: 'orca show state [--worktree <selector>] [--json]',
    allowedFlags: SHOW_FLAGS,
    notes: [
      'Use it to check that what you showed is on screen. worktreeOnScreen is false when Orca shows another worktree or its window is hidden.'
    ],
    examples: ['orca show state --json']
  },
  {
    path: ['show', 'snap'],
    summary: "Save a PNG of Orca's window without showing or focusing it",
    usage: 'orca show snap [--out <file.png>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'out'],
    notes: ['Without --out the PNG goes to the OS temp folder. The output names the file.'],
    examples: ['orca show snap', 'orca show snap --out /tmp/orca-window.png']
  }
]
