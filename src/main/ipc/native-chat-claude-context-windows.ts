import { ipcMain } from 'electron'
import { agentHookServer } from '../agent-hooks/server/agent-hook-server'
import { nativeChatTranscriptPathOnExecutionHost } from '../native-chat/ssh-transcript-path'
import { readClaudeModelContextWindows } from '../claude/claude-model-catalog-context-windows'
import { listClaudeProjectSessions } from '../claude/claude-project-sessions'
import { readNativeChatClaudeSubagents } from '../native-chat/native-chat-claude-subagents-read'
import { forkNativeChatClaudeTranscript } from '../native-chat/native-chat-claude-terminal-fork'
import { readClaudeSessionEffortSettings } from '../claude/claude-session-effort'
import { claudeSessionRecordDirs } from './pty/host-env/live-claude-session-holder'
import { getAppEnvironment } from '../../shared/app-environment'

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
  // A terminal-backed Claude chat shows the effort Claude started with until a hook reports one.
  ipcMain.removeHandler('nativeChat:claudeSessionEffort')
  ipcMain.handle('nativeChat:claudeSessionEffort', async (_event, sessionId: unknown) =>
    typeof sessionId === 'string'
      ? readClaudeSessionEffortSettings(
          sessionId,
          await claudeSessionRecordDirs(getAppEnvironment().getPath('userData'))
        )
      : { flag: null, byModel: {}, fallback: null }
  )
  // A terminal-backed Claude chat reads its session's own subagents to show their work.
  ipcMain.removeHandler('nativeChat:claudeSubagents')
  ipcMain.handle('nativeChat:claudeSubagents', (_event, args: unknown) =>
    readNativeChatClaudeSubagents(args, (sessionId, path) =>
      nativeChatTranscriptPathOnExecutionHost(agentHookServer.getStatusSnapshot(), sessionId, path)
    )
  )
  // A terminal-backed Claude chat's Fork and "Restart from here" copy its transcript up to a row.
  ipcMain.removeHandler('nativeChat:forkClaudeTranscript')
  ipcMain.handle('nativeChat:forkClaudeTranscript', (_event, args: unknown) =>
    forkNativeChatClaudeTranscript(args, (sessionId, path) =>
      nativeChatTranscriptPathOnExecutionHost(agentHookServer.getStatusSnapshot(), sessionId, path)
    )
  )
}
