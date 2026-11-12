import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { resolveNativeChatTranscriptAgent } from '../../../../shared/native-chat/native-chat-agent-support'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type {
  NativeChatReadSubagentsArgs,
  NativeChatReadSubagentsResult,
  NativeChatSubagentTranscript
} from '../../../../shared/native-chat/native-chat-subagent-transcripts'
import {
  hasClaudeSubagentSpawn,
  mergeClaudeSubagents
} from '../../../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import { publishNativeChatClaudeSubagents } from './native-chat-claude-subagents-store'

const NONE: readonly NativeChatSubagentTranscript[] = []
/** While a subagent runs, its rows are read this often. */
const LIVE_POLL_MS = 2_000

async function readSubagents(
  runtimeEnvironmentId: string | null,
  args: NativeChatReadSubagentsArgs
): Promise<NativeChatSubagentTranscript[]> {
  try {
    const result: NativeChatReadSubagentsResult | undefined = runtimeEnvironmentId
      ? await callRuntimeRpc<NativeChatReadSubagentsResult>(
          { kind: 'environment', environmentId: runtimeEnvironmentId },
          'nativeChat.readClaudeSubagents',
          args,
          { timeoutMs: 15_000 }
        )
      : await window.api.nativeChat.readClaudeSubagents?.(args)
    return Array.isArray(result?.subagents) ? result.subagents : []
  } catch {
    // Why quiet: an older host has no such method; the chat simply shows no subagent rows.
    return []
  }
}

/** Spawns and results only: a new subagent, or one ending, is what calls for a fresh read. */
function spawnKey(messages: readonly NativeChatMessage[]): string {
  let calls = 0
  let results = 0
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool-call' && (block.name === 'Agent' || block.name === 'Task')) {
        calls += 1
      } else if (block.type === 'tool-result') {
        results += 1
      }
    }
  }
  return `${calls}:${results}:${messages.length}`
}

/**
 * A terminal-backed Claude chat's own subagents (Paweł, 2026-11-10: "I need to see both native
 * harness subagents and orca subagents in given chat"): the session's rows with each subagent's
 * rows and a roster row per spawn, so the chat draws subagent sections as structured chats do.
 */
export function useNativeChatClaudeSubagents<T extends { messages: NativeChatMessage[] }>(
  session: T,
  {
    agent,
    sessionId,
    transcriptPath,
    runtimeEnvironmentId,
    paneKey,
    isVisible
  }: {
    agent: string
    sessionId: string | null
    transcriptPath: string | null | undefined
    runtimeEnvironmentId: string | null
    paneKey: string
    isVisible: boolean
  }
): T {
  const messages = session.messages
  const isClaude = resolveNativeChatTranscriptAgent(agent) === 'claude'
  const spawned = isClaude && sessionId !== null && hasClaudeSubagentSpawn(messages)
  const sessionLive = useAppStore((state) => Boolean(state.agentStatusByPaneKey[paneKey]))
  const [subagents, setSubagents] = useState<readonly NativeChatSubagentTranscript[]>(NONE)
  const key = spawned ? spawnKey(messages) : ''
  const anyRunning = useMemo(
    () => subagents.some((subagent) => subagent.finished !== true),
    [subagents]
  )

  useEffect(() => {
    if (!spawned || !sessionId || !isVisible) {
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const args: NativeChatReadSubagentsArgs = {
      agent,
      sessionId,
      ...(transcriptPath ? { transcriptPath } : {})
    }
    const tick = (): void => {
      void readSubagents(runtimeEnvironmentId, args).then((next) => {
        if (!alive) {
          return
        }
        setSubagents((current) => (sameSubagents(current, next) ? current : next))
        if (sessionLive && next.some((subagent) => subagent.finished !== true)) {
          timer = setTimeout(tick, LIVE_POLL_MS)
        }
      })
    }
    tick()
    return () => {
      alive = false
      if (timer) {
        clearTimeout(timer)
      }
    }
    // Why `key` and `anyRunning`: a new spawn or result reads again; polling covers live work.
  }, [
    spawned,
    sessionId,
    agent,
    transcriptPath,
    runtimeEnvironmentId,
    isVisible,
    sessionLive,
    key,
    anyRunning
  ])

  useEffect(() => {
    setSubagents(NONE)
  }, [sessionId])

  const shown = spawned ? subagents : NONE
  useEffect(() => {
    publishNativeChatClaudeSubagents(paneKey, shown)
  }, [paneKey, shown])
  useEffect(() => () => publishNativeChatClaudeSubagents(paneKey, NONE), [paneKey])

  return useMemo(
    () =>
      spawned && subagents.length > 0
        ? { ...session, messages: mergeClaudeSubagents(messages, subagents, sessionLive) }
        : session,
    [messages, session, sessionLive, spawned, subagents]
  )
}

function sameSubagents(
  current: readonly NativeChatSubagentTranscript[],
  next: readonly NativeChatSubagentTranscript[]
): boolean {
  return (
    current.length === next.length &&
    current.every((subagent, index) => {
      const other = next[index]!
      return (
        subagent.agentId === other.agentId &&
        subagent.finished === other.finished &&
        subagent.updatedAt === other.updatedAt &&
        subagent.messages.length === other.messages.length &&
        subagent.messages.at(-1)?.id === other.messages.at(-1)?.id
      )
    })
  )
}
