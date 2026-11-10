import { mkdirSync } from 'node:fs'
import { delimiter } from 'node:path'
import { isTuiAgentEnabled } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import { NATIVE_CHAT_SCRATCH_DIR_ENV } from '../../../native-chat/native-chat-visuals-delivery'
import { resolveNativeChatVisualsSkillLocationSync } from '../../../native-chat/native-chat-visuals-skill-location'
import { terminalChatsScratchFolderFor } from '../../../native-chat/native-chat-scratch-folder'
import { getProfileUserDataPath } from '../../../orca-profiles/profile-storage-paths'
import type { BuildPtyHostEnvOptions } from './types'

let preparedFolder: string | null = null

/**
 * Inline HTML visuals for terminal Claude (Paweł, 2026-11-10: the terminal Chat UI should show HTML
 * as structured chats do): the visuals skill rides along as a plugin dir and the shared terminal
 * chats folder is named in `ORCA_CHAT_SCRATCH_DIR`, where the skill saves its pages. The chat
 * reads them from there. Never for WSL, whose agent cannot write the host's folder.
 */
export function applyTerminalChatVisualsEnv(
  env: Record<string, string>,
  opts: BuildPtyHostEnvOptions
): void {
  if (opts.isWsl || !isTuiAgentEnabled('claude', opts.disabledTuiAgents)) {
    return
  }
  const skill = resolveNativeChatVisualsSkillLocationSync()
  if (!skill) {
    return
  }
  const folder = terminalChatsScratchFolderFor(getProfileUserDataPath())
  if (preparedFolder !== folder) {
    try {
      mkdirSync(folder, { recursive: true, mode: 0o700 })
      preparedFolder = folder
    } catch {
      return
    }
  }
  const paths =
    (env.CLAUDE_CODE_PLUGIN_DIRS ?? process.env.CLAUDE_CODE_PLUGIN_DIRS)
      ?.split(delimiter)
      .filter(Boolean) ?? []
  if (!paths.includes(skill.pluginDir)) {
    paths.push(skill.pluginDir)
  }
  env.CLAUDE_CODE_PLUGIN_DIRS = paths.join(delimiter)
  env[NATIVE_CHAT_SCRATCH_DIR_ENV] = folder
}
