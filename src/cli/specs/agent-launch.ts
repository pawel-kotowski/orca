import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

/** `agent launch`'s flags for a chat's own launch profile (`agents/chat-launch-profile-flags`). */
export const CHAT_LAUNCH_PROFILE_FLAGS = [
  'chat-profile',
  'claude-config-dir',
  'append-system-prompt-file',
  'env',
  'resume',
  'permission-mode'
]

export const AGENT_LAUNCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'launch'],
    summary: 'Start an agent in an existing workspace, as a chat or a terminal',
    usage:
      'orca agent launch --agent <id> [--worktree <selector>] [--prompt <text>] [--model <id>] [--effort <level>] [--surface chat|terminal] [--chat-profile <json>] [--claude-config-dir <dir>] [--append-system-prompt-file <file>] [--env KEY=VALUE]... [--resume <claude-session-id>] [--permission-mode <mode>] [--focus] [--retry-launch <operationId>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'worktree',
      'prompt',
      'model',
      'effort',
      'surface',
      'focus',
      'retry-launch',
      ...CHAT_LAUNCH_PROFILE_FLAGS
    ],
    repeatableFlags: ['env'],
    notes: [
      'Starts the agent the way a new agent tab does: as a chat when your Chat | CLI choice for the agent is Chat and the agent and host support it, otherwise as a terminal. The result says which (`outcome.kind`) and why (`receipt.detail`).',
      '--surface chat|terminal picks for this launch instead of your setting. --surface terminal always runs the agent CLI; --surface chat is refused when Orca can establish before starting anything that this agent cannot open as a chat there. If support cannot be checked, the launch can fall back to a terminal. If chat becomes unavailable after creating a workspace, Orca keeps the workspace, setup and default tabs, then opens a terminal; the receipt explains the fallback.',
      '--worktree defaults to the native folder workspace or worktree containing the current directory. For a new checkout with its agent, use `orca worktree create --agent`.',
      '--model takes a provider model id (OMP also takes its model roles and selectors) and --effort a reasoning effort for that model; --effort requires --model. Pi takes a `provider/id` model and maps --effort to `--thinking` (off, minimal, low, medium, high, xhigh, max). They apply to either surface.',
      'The tab opens without switching focus; pass --focus to switch to it.',
      'A Claude chat can carry its own launch profile, kept for it and applied at its every start (a resume after its agent stopped, an Orca restart, `orca chat login`): --chat-profile takes JSON `{"args": [...], "env": {...}, "appendSystemPromptFile": "...", "claudeConfigDir": "..."}` (args are Claude CLI arguments after your configured ones, such as `--settings <file>` or `--disallowedTools=X`); --claude-config-dir names the login (Claude config folder) it runs on instead of the workspace\'s account; --append-system-prompt-file is read at each start; --env KEY=VALUE adds to its environment. --resume continues an existing Claude conversation by its session id; --permission-mode ask|accept-edits|auto|full-access sets the chat\'s mode. All of them need --surface chat, and then never fall back to a terminal.',
      'If the launch reply is lost, re-issue the same command from the same directory on the same host with --retry-launch <operationId> from the error. Never retry as a fresh launch; older hosts require inspecting the workspace first.'
    ],
    examples: [
      'orca agent launch --agent codex --json',
      'orca agent launch --agent codex --model gpt-6-astra --effort high --prompt "Write the design doc" --json',
      'orca agent launch --agent claude --worktree path:/projects/myapp --focus',
      'orca agent launch --agent claude --surface chat --permission-mode full-access --append-system-prompt-file ./system.md --env TASK=42 --chat-profile \'{"args":["--settings","/tmp/hooks.json"]}\' --prompt "Start" --json'
    ]
  },
  {
    path: ['agent', 'installed'],
    summary: 'List the agent CLIs installed on this host, with the IDs --agent takes',
    usage: 'orca agent installed [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      "Lists the agents Orca detects on the host that can start: ones turned off in Settings → Agents are left out, and ones set up there with a custom command are included. Each `id` is what `orca agent launch --agent` and `orca worktree create --agent` take; `default` marks the user's default agent.",
      'This lists installed agent CLIs, not running agents; use `orca agent list` for those.',
      '--worktree checks where that workspace runs agents, such as its SSH host or WSL distro. A stopped WSL distro is not started to check.'
    ],
    examples: ['orca agent installed --json', 'orca agent installed --worktree active']
  },
  {
    path: ['agent', 'surface', 'status'],
    summary: 'Show whether new agents open as a chat or in a terminal',
    usage: 'orca agent surface status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads Settings → Agents → Open agents as (`agentDefaultSurface`) on this host, or on a paired server with --environment, plus any agent set to its own surface on its Installed row.',
      'Every agent Orca starts without a per-launch choice follows it: new tabs, Create worktree with an agent, `orca worktree create --agent`, `orca agent launch`, and `orca orchestration worker-start` workers. Agents set on their own row keep their choice.'
    ],
    examples: ['orca agent surface status', 'orca agent surface status --json']
  },
  {
    path: ['agent', 'surface', 'chat'],
    summary: 'Open new agents as structured chats',
    usage: 'orca agent surface chat [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Sets Settings → Agents → Open agents as to Chat. Agents or hosts that cannot run a chat still open in a terminal, and the launch receipt says why.'
    ],
    examples: ['orca agent surface chat', 'orca agent surface chat --environment devbox']
  },
  {
    path: ['agent', 'surface', 'terminal'],
    summary: 'Open new agents in a terminal',
    usage: 'orca agent surface terminal [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Sets Settings → Agents → Open agents as to Terminal.'],
    examples: ['orca agent surface terminal']
  }
]
