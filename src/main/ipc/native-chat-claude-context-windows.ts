import { ipcMain } from 'electron'
import { readClaudeModelContextWindows } from '../claude/claude-model-catalog-context-windows'

/** A terminal-backed Claude chat asks for its models' context windows to size its context readout. */
export function registerNativeChatClaudeContextWindowsHandler(): void {
  ipcMain.handle('nativeChat:claudeContextWindows', (_event, transcriptPath: unknown) =>
    typeof transcriptPath === 'string' ? readClaudeModelContextWindows(transcriptPath) : {}
  )
}
