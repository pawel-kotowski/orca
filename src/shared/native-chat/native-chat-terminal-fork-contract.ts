// A terminal-backed Claude chat's shortened copy, made on the host that holds its transcript, so a
// new terminal tab can resume it while the source chat's Claude keeps writing its own file.

/** Where the copy ends: through the end of a response's turn, or just before a prompt. */
export type NativeChatTerminalForkCut =
  | { kind: 'through-response'; uuid: string }
  | { kind: 'before-prompt'; uuid: string }

export type NativeChatForkClaudeTranscriptArgs = {
  sessionId: string
  transcriptPath?: string
  cut: NativeChatTerminalForkCut
}

export type NativeChatForkClaudeTranscriptResult =
  /** The copy, a new Claude session beside the source's transcript. */
  | { ok: true; kind: 'copy'; sessionId: string; transcriptPath: string; throughUuid: string }
  /** Nothing comes before the prompt: the restart is a new conversation. */
  | { ok: true; kind: 'empty' }
  /** `unsupported`: this host cannot read the transcript (SSH or WSL); `failed` carries why. */
  | { ok: false; reason: 'unsupported' | 'not-found' | 'failed'; message?: string }

/** Validates untrusted IPC/RPC input; null when it names no transcript row to cut at. */
export function parseNativeChatForkClaudeTranscriptArgs(
  value: unknown
): NativeChatForkClaudeTranscriptArgs | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const { sessionId, transcriptPath, cut } = value as Record<string, unknown>
  if (typeof sessionId !== 'string' || !sessionId || !cut || typeof cut !== 'object') {
    return null
  }
  const { kind, uuid } = cut as Record<string, unknown>
  if ((kind !== 'through-response' && kind !== 'before-prompt') || typeof uuid !== 'string') {
    return null
  }
  if (!uuid) {
    return null
  }
  return {
    sessionId,
    ...(typeof transcriptPath === 'string' && transcriptPath ? { transcriptPath } : {}),
    cut: { kind, uuid }
  }
}
