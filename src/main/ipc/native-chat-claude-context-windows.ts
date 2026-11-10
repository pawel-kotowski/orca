import { ipcMain } from 'electron'
import { agentHookServer } from '../agent-hooks/server'
import { nativeChatTranscriptPathOnExecutionHost } from '../native-chat/ssh-transcript-path'
import { readClaudeModelContextWindows } from '../claude/claude-model-catalog-context-windows'
import { listClaudeProjectSessions } from '../claude/claude-project-sessions'
import { readNativeChatClaudeSubagents } from '../native-chat/native-chat-claude-subagents-read'

/** A terminal-backed Claude chat asks for its models' context windows to size its context readout. */
export function registerNativeChatClaudeContextWindowsHandler(): void {
  ipcMain.handle('nativeChat:claudeContextWindows', (_event, transcriptPath: unknown) =>
    typeof transcriptPath === 'string' ? readClaudeModelContextWindows(transcriptPath) : {}
  )
  // A terminal-backed Claude chat lists its project's conversations for its Resume picker.
  ipcMain.removeHandler('nativeChat:claudeProjectSessions')
  ipcMain.handle('nativeChat:claudeProjectSessions', (_event, transcriptPath: unknown) =>
    typeof transcriptPath === 'string' ? listClaudeProjectSessions(transcriptPath) : []
  )
  // A terminal-backed Claude chat reads its session's own subagents to show their work.
  ipcMain.removeHandler('nativeChat:claudeSubagents')
  ipcMain.handle('nativeChat:claudeSubagents', (_event, args: unknown) =>
    readNativeChatClaudeSubagents(args, (sessionId, path) =>
      nativeChatTranscriptPathOnExecutionHost(agentHookServer.getStatusSnapshot(), sessionId, path)
    )
  )
}
