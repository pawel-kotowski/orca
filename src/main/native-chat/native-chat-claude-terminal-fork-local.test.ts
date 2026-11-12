import { describe, expect, it, vi } from 'vitest'
import {
  forkNativeChatClaudeTranscript,
  nativeChatClaudeForkCopyInput
} from './native-chat-claude-terminal-fork'
import { AgentConversationCopyError } from './agent-conversation-copy-error'
import { toSshTranscriptPath } from './ssh-transcript-path'

const PATH = '/data/claude-profiles/acc-1/home/projects/-repo/source-id.jsonl'
const hostPath = () => PATH

function copied() {
  return vi.fn().mockResolvedValue({
    sessionId: 'copy-id',
    resumeCursor: 'last-uuid',
    filePath: '/data/claude-profiles/acc-1/home/projects/-repo/copy-id.jsonl',
    coverage: { unit: 'claude-entry', ids: [] }
  })
}

describe('nativeChatClaudeForkCopyInput', () => {
  it('copies through a response, beside the source so the account and project stay', () => {
    expect(nativeChatClaudeForkCopyInput(PATH, { kind: 'through-response', uuid: 'r1' })).toEqual({
      sourcePath: PATH,
      sourceSessionId: 'source-id',
      checkpoint: {
        selectedItemId: 'r1',
        settled: true,
        throughMessage: { sessionId: 'source-id', uuid: 'r1' }
      },
      destinationDirectory: '/data/claude-profiles/acc-1/home/projects/-repo'
    })
  })

  it('cuts before a prompt', () => {
    expect(
      nativeChatClaudeForkCopyInput(PATH, { kind: 'before-prompt', uuid: 'p1' }).checkpoint
    ).toEqual({
      selectedItemId: 'p1',
      settled: true,
      beforeMessage: { sessionId: 'source-id', uuid: 'p1' }
    })
  })
})

describe('forkNativeChatClaudeTranscript', () => {
  it('returns the copy the materializer wrote', async () => {
    const materialize = copied()
    const result = await forkNativeChatClaudeTranscript(
      { sessionId: 'source-id', cut: { kind: 'through-response', uuid: 'r1' } },
      hostPath,
      { materialize }
    )
    expect(result).toEqual({
      ok: true,
      kind: 'copy',
      sessionId: 'copy-id',
      transcriptPath: '/data/claude-profiles/acc-1/home/projects/-repo/copy-id.jsonl',
      throughUuid: 'last-uuid'
    })
    expect(materialize.mock.calls[0]![0]).toMatchObject({
      sourcePath: PATH,
      checkpoint: { throughMessage: { uuid: 'r1' } }
    })
    expect(materialize.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal)
  })

  it('reads the prompt parent in the transcript own account home', async () => {
    const promptParent = vi.fn().mockResolvedValue('r0')
    const materialize = copied()
    await forkNativeChatClaudeTranscript(
      { sessionId: 'source-id', cut: { kind: 'before-prompt', uuid: 'p1' } },
      hostPath,
      { materialize, promptParent }
    )
    expect(promptParent).toHaveBeenCalledWith({
      providerSessionId: 'source-id',
      promptUuid: 'p1',
      claudeConfigDir: '/data/claude-profiles/acc-1/home'
    })
    expect(materialize.mock.calls[0]![0].checkpoint.beforeMessage).toEqual({
      sessionId: 'source-id',
      uuid: 'p1'
    })
  })

  it('answers empty for the first prompt without copying', async () => {
    const materialize = copied()
    const result = await forkNativeChatClaudeTranscript(
      { sessionId: 'source-id', cut: { kind: 'before-prompt', uuid: 'p1' } },
      hostPath,
      { materialize, promptParent: vi.fn().mockResolvedValue(null) }
    )
    expect(result).toEqual({ ok: true, kind: 'empty' })
    expect(materialize).not.toHaveBeenCalled()
  })

  it('refuses SSH transcripts, bad arguments and unknown prompts', async () => {
    const materialize = copied()
    const cut = { kind: 'through-response', uuid: 'r1' }
    expect(
      await forkNativeChatClaudeTranscript(
        { sessionId: 's', cut },
        () => toSshTranscriptPath('conn', '/home/x.jsonl'),
        { materialize }
      )
    ).toEqual({ ok: false, reason: 'unsupported' })
    expect(
      await forkNativeChatClaudeTranscript({ sessionId: 's', cut: { kind: 'rewind' } }, hostPath, {
        materialize
      })
    ).toEqual({ ok: false, reason: 'not-found' })
    expect(
      await forkNativeChatClaudeTranscript(
        { sessionId: 's', cut: { kind: 'before-prompt', uuid: 'p9' } },
        hostPath,
        { materialize, promptParent: vi.fn().mockResolvedValue(undefined) }
      )
    ).toEqual({ ok: false, reason: 'not-found' })
    expect(materialize).not.toHaveBeenCalled()
  })

  it('passes the copy error words through', async () => {
    const result = await forkNativeChatClaudeTranscript(
      { sessionId: 's', cut: { kind: 'through-response', uuid: 'r1' } },
      hostPath,
      {
        materialize: vi
          .fn()
          .mockRejectedValue(new AgentConversationCopyError('Claude could not copy this chat.'))
      }
    )
    expect(result).toEqual({
      ok: false,
      reason: 'failed',
      message: 'Claude could not copy this chat.'
    })
  })
})
