import { ipcMain } from 'electron'
import { readClaudeModelContextWindows } from '../claude/claude-model-catalog-context-windows'
import { listClaudeProjectSessions } from '../claude/claude-project-sessions'

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
}
