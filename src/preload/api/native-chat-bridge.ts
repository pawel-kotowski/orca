import type {
  NativeChatForkClaudeTranscriptArgs,
  NativeChatForkClaudeTranscriptResult
} from '../../shared/native-chat/native-chat-terminal-fork-contract'
import type {
  NativeChatReadSubagentsArgs,
  NativeChatReadSubagentsResult
} from '../../shared/native-chat/native-chat-subagent-transcripts'
import type { ClaudeProjectSession } from '../../shared/native-chat/claude-project-session-types'
import type { ClaudeSessionEffortSettings } from '../../shared/native-chat/claude-session-effort-types'
import { ipcRenderer } from 'electron'
import type {
  NativeChatAppendedPayload,
  NativeChatReadSessionResult,
  NativeChatSubscriptionFrame,
  PreloadApi
} from '../api-types'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import {
  NATIVE_CHAT_VISUAL_GUEST_THEME_PUBLISH,
  type NativeChatVisualTheme
} from '../../shared/native-chat/native-chat-visual-shell'

export const nativeChatApi = {
  // Acknowledge the in-memory snapshot before guest creation can start its preload.
  publishVisualGuestTheme: (theme: NativeChatVisualTheme): void => {
    ipcRenderer.sendSync(NATIVE_CHAT_VISUAL_GUEST_THEME_PUBLISH, theme)
  },
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string,
    options?: { wakeWslDistro?: boolean }
  ): Promise<NativeChatReadSessionResult> =>
    ipcRenderer.invoke('nativeChat:readSession', {
      agent,
      sessionId,
      limit,
      transcriptPath,
      wakeWslDistro: options?.wakeWslDistro
    }),
  subscribe: (
    args: {
      subscriptionId: string
      agent: AgentType
      sessionId: string
      transcriptPath?: string
      limit?: number
      wakeWslDistro?: boolean
    },
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: NativeChatAppendedPayload) => {
      if (payload.subscriptionId === args.subscriptionId) {
        onFrame(payload.frame)
      }
    }
    ipcRenderer.on('nativeChat:appended', listener)
    ipcRenderer.send('nativeChat:subscribe', args)
    return () => {
      ipcRenderer.removeListener('nativeChat:appended', listener)
      ipcRenderer.send('nativeChat:unsubscribe', { subscriptionId: args.subscriptionId })
    }
  },
  getConversationNameFailureOutput: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke('nativeChat:conversationNameFailureOutput', sessionId),
  getClaudeSessionEffort: (sessionId: string): Promise<ClaudeSessionEffortSettings> =>
    ipcRenderer.invoke('nativeChat:claudeSessionEffort', sessionId),
  getClaudeContextWindows: (transcriptPath: string): Promise<Record<string, number>> =>
    ipcRenderer.invoke('nativeChat:claudeContextWindows', transcriptPath),
  readClaudeSubagents: (
    args: NativeChatReadSubagentsArgs
  ): Promise<NativeChatReadSubagentsResult> =>
    ipcRenderer.invoke('nativeChat:claudeSubagents', args),
  forkClaudeTranscript: (
    args: NativeChatForkClaudeTranscriptArgs
  ): Promise<NativeChatForkClaudeTranscriptResult> =>
    ipcRenderer.invoke('nativeChat:forkClaudeTranscript', args),
  listClaudeProjectSessions: (transcriptPath: string): Promise<ClaudeProjectSession[]> =>
    ipcRenderer.invoke('nativeChat:claudeProjectSessions', transcriptPath)
} satisfies PreloadApi['nativeChat']
