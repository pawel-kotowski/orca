import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { parseRemoteRuntimePtyId } from '../../../../shared/remote-runtime/remote-runtime-pty-id'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { claudeConfigDirFromTranscriptPath } from '../../../../shared/agent-accounts/claude/claude-session-login'
import type {
  ClaudeHostLogin,
  ClaudeHostLogins,
  ClaudeLoginMoveRefusal,
  ClaudeLoginMoveResult
} from '../../../../shared/agent-accounts/claude/claude-host-logins'

const TIMEOUT_MS = 30_000
/** A move that can run at once answers when Claude is up again. */
const MOVE_TIMEOUT_MS = 120_000

/** Where a tab's chat is moving, until its transcript names the new folder. Per terminal tab. */
const movingByTab = new Map<string, string>()
/** Tabs whose pick the host has not answered yet; it alone knows where those stand. */
const unanswered = new Set<string>()
const listeners = new Set<() => void>()
const WAITING_POLL_MS = 5_000

function setMoving(terminalTabId: string, configDir: string | null): void {
  if ((movingByTab.get(terminalTabId) ?? null) === configDir) {
    return
  }
  if (configDir === null) {
    movingByTab.delete(terminalTabId)
  } else {
    movingByTab.set(terminalTabId, configDir)
  }
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The host's handle of the chat's terminal: its Claude pane's, else the tab's first. */
export function remoteChatTerminalHandle(terminalTabId: string): string | null {
  const state = useAppStore.getState()
  const bound = Object.entries(
    state.terminalLayoutsByTabId[terminalTabId]?.ptyIdsByLeafId ?? {}
  ).filter(([, ptyId]) => Boolean(ptyId))
  const runsClaude = ([leafId]: [string, string]): boolean => {
    const paneKey = makePaneKey(terminalTabId, leafId)
    return (
      state.agentStatusByPaneKey.get(paneKey)?.agentType === 'claude' ||
      state.sleepingAgentSessionsByPaneKey[paneKey]?.agent === 'claude'
    )
  }
  const ptyId = (bound.find(runsClaude) ?? bound[0])?.[1]
  return ptyId ? (parseRemoteRuntimePtyId(ptyId)?.handle ?? null) : null
}

export type RemoteChatClaudeLogins = {
  logins: ClaudeHostLogin[]
  currentConfigDir: string | null
  movingTo: string | null
  backgroundWork: boolean
  refresh: () => void
  move: (login: ClaudeHostLogin, name: string) => void
}

/** The logins this chat's host can run Claude on; none until it answers, or when it is too old to. */
export function useRemoteChatClaudeLogins(args: {
  environmentId: string
  terminalTabId: string
  transcriptPath: string | null
}): RemoteChatClaudeLogins {
  const { environmentId, terminalTabId, transcriptPath } = args
  const [read, setRead] = useState<ClaudeHostLogins | null>(null)
  const currentConfigDir = claudeConfigDirFromTranscriptPath(transcriptPath)
  const movingTo = useSyncExternalStore(subscribe, () => movingByTab.get(terminalTabId) ?? null)
  const refresh = useCallback(() => {
    const terminal = remoteChatTerminalHandle(terminalTabId)
    void callRuntimeRpc<ClaudeHostLogins>(
      { kind: 'environment', environmentId },
      'nativeChat.claudeLogins',
      { ...(terminal ? { terminal } : {}), ...(transcriptPath ? { transcriptPath } : {}) },
      { timeoutMs: TIMEOUT_MS }
    ).then(
      (next) => {
        setRead(next)
        if (!unanswered.has(terminalTabId)) {
          setMoving(terminalTabId, next.movingTo)
        }
      },
      () => undefined
    )
  }, [environmentId, terminalTabId, transcriptPath])
  useEffect(refresh, [refresh])
  useEffect(() => {
    if (movingTo !== null && movingTo === currentConfigDir) {
      setMoving(terminalTabId, null)
    }
  }, [movingTo, currentConfigDir, terminalTabId])
  // A waiting move ends on the host: by moving, or by the pane going on without it.
  useEffect(() => {
    if (movingTo === null) {
      return
    }
    const timer = window.setInterval(refresh, WAITING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [movingTo, refresh])
  const move = useCallback(
    (login: ClaudeHostLogin, name: string) => {
      const terminal = remoteChatTerminalHandle(terminalTabId)
      if (!terminal) {
        toastRefused('not_local', name)
        return
      }
      setMoving(terminalTabId, login.configDir)
      unanswered.add(terminalTabId)
      void callRuntimeRpc<ClaudeLoginMoveResult>(
        { kind: 'environment', environmentId },
        'nativeChat.moveClaudeLogin',
        { terminal, configDir: login.configDir, ...(transcriptPath ? { transcriptPath } : {}) },
        { timeoutMs: MOVE_TIMEOUT_MS }
      )
        .finally(() => unanswered.delete(terminalTabId))
        .then(
          (result) => {
            if (result.outcome === 'refused') {
              setMoving(terminalTabId, null)
              toastRefused(result.reason, name)
              return
            }
            if (result.outcome === 'unchanged') {
              setMoving(terminalTabId, null)
              return
            }
            toast.success(
              translate(
                'components.native-chat.account.switching',
                'Moving this chat to {{name}}',
                {
                  name
                }
              ),
              {
                description:
                  result.outcome === 'queued'
                    ? translate(
                        'components.native-chat.account.switchingRestart',
                        'Claude restarts on it when its turn ends and picks the conversation up.'
                      )
                    : translate(
                        'components.native-chat.account.switchedNow',
                        'Claude runs on it now and picked the conversation up.'
                      )
              }
            )
          },
          () => {
            setMoving(terminalTabId, null)
            toastRefused('start_failed', name)
          }
        )
    },
    [environmentId, terminalTabId, transcriptPath]
  )
  return {
    logins: read?.logins ?? [],
    currentConfigDir,
    movingTo: movingTo === currentConfigDir ? null : movingTo,
    backgroundWork: read?.backgroundWork ?? false,
    refresh,
    move
  }
}

function toastRefused(reason: ClaudeLoginMoveRefusal, name: string): void {
  toast.error(
    translate('components.native-chat.account.moveFailed', 'Could not move this chat to {{name}}', {
      name
    }),
    { description: refusalText(reason) }
  )
}

function refusalText(reason: ClaudeLoginMoveRefusal): string {
  switch (reason) {
    case 'unknown_login':
      return translate(
        'components.native-chat.account.moveUnknownLogin',
        'That machine is no longer signed in to it.'
      )
    case 'not_local':
      return translate(
        'components.native-chat.account.moveNoTerminal',
        "The chat's terminal is not open on that machine. Open it and try again."
      )
    case 'no_session':
      return translate(
        'components.native-chat.account.moveNoSession',
        'The terminal has no Claude conversation to move yet.'
      )
    case 'not_shared':
      return translate(
        'components.native-chat.account.moveNotShared',
        'That login keeps its conversations apart and cannot read this one.'
      )
    case 'running_elsewhere':
      return translate(
        'components.native-chat.account.moveElsewhere',
        'Another terminal runs this conversation.'
      )
    case 'terminal_busy':
      return translate(
        'components.native-chat.account.moveBusy',
        "Something else runs in the chat's terminal."
      )
    case 'stop_failed':
      return translate(
        'components.native-chat.account.moveStopFailed',
        'Claude did not stop, so it stays where it was.'
      )
    case 'start_failed':
      return translate(
        'components.native-chat.account.moveStartFailed',
        "Claude did not come up on it. The chat's terminal shows why."
      )
  }
}
