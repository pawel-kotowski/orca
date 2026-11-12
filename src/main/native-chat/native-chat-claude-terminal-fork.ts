import { basename, dirname } from 'node:path'
import { readClaudePromptParentUuid } from '../claude/transcripts/claude-rewind-fork'
import { materializeClaudeConversationTranscript } from '../claude/transcripts/claude-rewind-transcript'
import { AgentConversationCopyError } from './agent-conversation-copy-error'
import { resolveSessionFilePath } from './session-file-resolver'
import { parseSshTranscriptPath } from './ssh-transcript-path'
import {
  parseNativeChatForkClaudeTranscriptArgs,
  type NativeChatForkClaudeTranscriptResult
} from '../../shared/native-chat/native-chat-terminal-fork-contract'

type Materialize = typeof materializeClaudeConversationTranscript
type PromptParent = typeof readClaudePromptParentUuid

const COPY_TIMEOUT_MS = 60_000

/** The arguments the materializer gets for a cut; exported so tests pin the boundary it asks for. */
export function nativeChatClaudeForkCopyInput(
  sourcePath: string,
  cut: { kind: 'through-response' | 'before-prompt'; uuid: string }
): Omit<Parameters<Materialize>[0], 'signal'> {
  // Why the file's name: the copy's source key is the transcript Claude writes, whatever the chat
  // calls its session.
  const sourceSessionId = basename(sourcePath, '.jsonl')
  const message = { sessionId: sourceSessionId, uuid: cut.uuid }
  return {
    sourcePath,
    sourceSessionId,
    // Why settled: rows are offered only on finished turns, and a copy before a prompt never
    // reaches a running one.
    checkpoint: {
      selectedItemId: cut.uuid,
      settled: true,
      ...(cut.kind === 'before-prompt' ? { beforeMessage: message } : { throughMessage: message })
    },
    // Beside the source, so the copy keeps its account home and project folder.
    destinationDirectory: dirname(sourcePath)
  }
}

/**
 * Writes a shortened copy of a terminal-backed Claude chat's transcript as a new session, for
 * local IPC and the runtime RPC alike. The source file is only read, so its running Claude keeps
 * writing it undisturbed. SSH and WSL transcripts are not readable here.
 */
export async function forkNativeChatClaudeTranscript(
  args: unknown,
  hostPath: (sessionId: string, requested: string | undefined) => string | undefined,
  deps: { materialize?: Materialize; promptParent?: PromptParent } = {}
): Promise<NativeChatForkClaudeTranscriptResult> {
  const parsed = parseNativeChatForkClaudeTranscriptArgs(args)
  if (!parsed) {
    return { ok: false, reason: 'not-found' }
  }
  const path =
    hostPath(parsed.sessionId, parsed.transcriptPath) ??
    (await resolveSessionFilePath('claude', parsed.sessionId, {
      transcriptPath: parsed.transcriptPath
    }).catch(() => null))
  if (!path) {
    return { ok: false, reason: 'not-found' }
  }
  if (parseSshTranscriptPath(path) || path.startsWith('\\\\')) {
    return { ok: false, reason: 'unsupported' }
  }
  try {
    if (parsed.cut.kind === 'before-prompt') {
      // <config>/projects/<project>/<session>.jsonl: the prompt's parent is read in that home.
      const parent = await (deps.promptParent ?? readClaudePromptParentUuid)({
        providerSessionId: basename(path, '.jsonl'),
        promptUuid: parsed.cut.uuid,
        claudeConfigDir: dirname(dirname(dirname(path)))
      })
      if (parent === null) {
        return { ok: true, kind: 'empty' }
      }
      if (parent === undefined) {
        return { ok: false, reason: 'not-found' }
      }
    }
    const copy = await (deps.materialize ?? materializeClaudeConversationTranscript)({
      ...nativeChatClaudeForkCopyInput(path, parsed.cut),
      signal: AbortSignal.timeout(COPY_TIMEOUT_MS)
    })
    if (!copy) {
      // Only commands and hook output came before the prompt: nothing to resume.
      return parsed.cut.kind === 'before-prompt'
        ? { ok: true, kind: 'empty' }
        : { ok: false, reason: 'failed' }
    }
    return {
      ok: true,
      kind: 'copy',
      sessionId: copy.sessionId,
      transcriptPath: copy.filePath,
      throughUuid: copy.resumeCursor
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      ...(error instanceof AgentConversationCopyError ? { message: error.message } : {})
    }
  }
}
