import { useEffect, useState } from 'react'
import {
  readNativeChatVisual,
  type NativeChatVisualDocument,
  type NativeChatVisualIdentity
} from '../native-chat-visual-read-client'
import type { AgentSessionVisualReadError } from '../../../../../../../shared/rpc-contract/structured-agent-session/agent-session-visual-params'

export type FollowedChatVisual =
  | { status: 'loading' }
  | { status: 'ready'; document: NativeChatVisualDocument }
  | { status: 'unavailable'; reason: AgentSessionVisualReadError | 'unavailable' }

/** How often an open tab asks the host whether the agent rewrote the page; unchanged answers carry no bytes. */
const FOLLOW_INTERVAL_MS = 1_500

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function follow(
  identity: NativeChatVisualIdentity,
  signal: AbortSignal,
  setState: (update: (shown: FollowedChatVisual) => FollowedChatVisual) => void
): Promise<void> {
  while (!signal.aborted) {
    const outcome = await readNativeChatVisual(identity, { fresh: true })
    if (signal.aborted) {
      return
    }
    setState((shown) => {
      if (outcome.ok) {
        return shown.status === 'ready' && shown.document.revision === outcome.document.revision
          ? shown
          : { status: 'ready', document: outcome.document }
      }
      // Losing contact says nothing about the file: keep showing the page.
      return shown.status === 'ready' && outcome.reason === 'unavailable'
        ? shown
        : { status: 'unavailable', reason: outcome.reason }
    })
    await pause(FOLLOW_INTERVAL_MS, signal)
  }
}

/** The visual as its host has it now, re-read while the tab is shown so an agent's rewrite appears by itself. */
export function useFollowedChatVisual(
  identity: NativeChatVisualIdentity,
  active: boolean
): FollowedChatVisual {
  const [state, setState] = useState<FollowedChatVisual>({ status: 'loading' })
  const environmentId =
    identity.target.kind === 'environment' ? identity.target.environmentId : null
  const { sessionId, file } = identity
  useEffect(() => {
    if (!active) {
      return
    }
    const abort = new AbortController()
    void follow(
      {
        target: environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
        sessionId,
        file
      },
      abort.signal,
      setState
    )
    return () => abort.abort()
  }, [active, environmentId, file, sessionId])
  return state
}
