import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { activateTabAndFocusPane } from '@/lib/workspace/tabs/activate-tab-and-focus-pane'
import { activateTerminalTabOnOwner } from '@/lib/workspace/tabs/terminal-tab-owner-activation'
import { useAppStore } from '@/store/index'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import {
  nativeChatTerminalForkAgent,
  nativeChatTerminalPromptRestartable,
  nativeChatTerminalResponseInLatestTurn,
  nativeChatTerminalRestartDraft,
  nativeChatTerminalRowOffersFork
} from '../../../../../../shared/native-chat/native-chat-terminal-row-actions'
import type { NativeChatForkSurface } from './use-native-chat-fork'
import type { NativeChatRewindSurface } from './use-native-chat-rewind-host'
import {
  launchNativeChatTerminalFork,
  type NativeChatTerminalForkCutRequest
} from './native-chat-terminal-fork-launch'
import { findNativeChatTerminalForkSource } from './native-chat-terminal-fork-origins'

export type NativeChatTerminalRowActionsSource = {
  agent: string
  sessionId: string | null
  transcriptPath: string | null | undefined
  paneKey: string
  terminalTabId: string
}

export type NativeChatTerminalRowActions = {
  fork: NativeChatForkSurface | undefined
  restart: NativeChatRewindSurface | undefined
  openSource: (sourceSessionId: string) => void
}

const NO_IDS: ReadonlySet<string> = new Set()

/** Keeps the set's identity while its members hold, so streaming does not re-render every row. */
function useStableIds(next: ReadonlySet<string>): ReadonlySet<string> {
  const previous = useRef(NO_IDS)
  const stable =
    next.size === previous.current.size && [...next].every((id) => previous.current.has(id))
      ? previous.current
      : next
  useLayoutEffect(() => {
    previous.current = stable
  }, [stable])
  return stable
}

function openForkSource(sourceSessionId: string): void {
  const origin = findNativeChatTerminalForkSource(sourceSessionId)
  const exists = origin
    ? useAppStore
        .getState()
        .tabsByWorktree[origin.worktreeId]?.some((tab) => tab.id === origin.sourceTabId)
    : false
  if (!origin || !exists) {
    return
  }
  activateTabAndFocusPane(origin.sourceTabId, null)
  activateTerminalTabOnOwner(origin.worktreeId, origin.sourceTabId, null)
}

/**
 * A terminal-backed chat's row actions: Fork on its responses and "Restart from here in a new
 * tab" on its prompts. Both open a copy in a new tab and leave this one running, since its agent
 * keeps writing the transcript the copy is read from.
 */
export function useNativeChatTerminalRowActions(input: {
  source: NativeChatTerminalRowActionsSource
  worktreeId: string | null
  runtimeEnvironmentId: string | null
  messages: readonly NativeChatMessage[]
}): NativeChatTerminalRowActions {
  const agent = nativeChatTerminalForkAgent(input.source.agent)
  const latest = useRef(input)
  useLayoutEffect(() => {
    latest.current = input
  })
  // Reserved at the click, before any await, so a second click never opens a second tab.
  const inFlight = useRef(false)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const start = useCallback(
    async (itemId: string, cut: NativeChatTerminalForkCutRequest): Promise<void> => {
      const { source, worktreeId, runtimeEnvironmentId } = latest.current
      const forkAgent = nativeChatTerminalForkAgent(source.agent)
      if (inFlight.current || !forkAgent || !worktreeId || !source.sessionId) {
        return
      }
      inFlight.current = true
      setPendingItemId(itemId)
      try {
        await launchNativeChatTerminalFork(
          {
            agent: forkAgent,
            paneKey: source.paneKey,
            terminalTabId: source.terminalTabId,
            worktreeId,
            runtimeEnvironmentId,
            sessionId: source.sessionId,
            transcriptPath: source.transcriptPath ?? null
          },
          cut
        )
      } finally {
        inFlight.current = false
        setPendingItemId(null)
      }
    },
    []
  )
  const requestFork = useCallback(
    async (throughItemId: string) => {
      await start(throughItemId, {
        kind: 'through-response',
        uuid: throughItemId,
        inLatestTurn: nativeChatTerminalResponseInLatestTurn(latest.current.messages, throughItemId)
      })
      return {}
    },
    [start]
  )
  const requestRestart = useCallback(
    async (itemId: string, confirm: ConfirmationDialogContextValue) => {
      const message = latest.current.messages.find((entry) => entry.id === itemId)
      if (!message || inFlight.current) {
        return
      }
      const confirmed = await confirm({
        title: translate(
          'components.native-chat.terminalRestart.title',
          'Restart from here in a new tab?'
        ),
        description: translate(
          'components.native-chat.terminalRestart.confirmation',
          'A new tab opens with this chat up to just before this message, and the message waits in its composer so you can edit and send it. This tab keeps running as it is.'
        ),
        confirmLabel: translate(
          'components.native-chat.terminalRestart.confirm',
          'Restart in new tab'
        ),
        cancelLabel: translate('components.native-chat.terminalRestart.cancel', 'Cancel'),
        cancelVariant: 'ghost'
      })
      if (confirmed) {
        await start(itemId, {
          kind: 'before-prompt',
          uuid: itemId,
          draft: nativeChatTerminalRestartDraft(message)
        })
      }
    },
    [start]
  )
  const offersRow = useCallback(
    (row: Parameters<typeof nativeChatTerminalRowOffersFork>[0]) =>
      agent !== null && nativeChatTerminalRowOffersFork(row, agent),
    [agent]
  )
  const rowAction = useMemo(
    () => ({
      support: {
        kind: 'known' as const,
        // Claude copies any finished turn; Codex forks only the whole conversation.
        fork: agent === 'claude' ? ('checkpoint' as const) : ('tip' as const)
      },
      pendingItemId,
      request: requestFork
    }),
    [agent, pendingItemId, requestFork]
  )
  const usable = agent !== null && input.worktreeId !== null && input.source.sessionId !== null
  const fork = useMemo<NativeChatForkSurface | undefined>(
    () =>
      usable
        ? {
            ...rowAction,
            contextFloorSequence: 0,
            forkableItemIds: NO_IDS,
            rowAction,
            offersRow
          }
        : undefined,
    [offersRow, rowAction, usable]
  )
  const restartable = useStableIds(
    useMemo(
      () =>
        new Set(
          agent
            ? input.messages
                .filter((message) => nativeChatTerminalPromptRestartable(message, agent))
                .map((message) => message.id)
            : []
        ),
      [agent, input.messages]
    )
  )
  const restart = useMemo<NativeChatRewindSurface | undefined>(
    () =>
      usable && agent === 'claude'
        ? {
            disabledReason:
              pendingItemId === null
                ? null
                : translate('components.native-chat.terminalRestart.pending', 'Opening a new tab…'),
            eligibleItemIds: restartable,
            request: requestRestart,
            label: translate(
              'components.native-chat.terminalRestart.action',
              'Restart from here in a new tab'
            ),
            tooltip: translate(
              'components.native-chat.terminalRestart.tooltip',
              'Open a new tab with this chat up to just before this message, the message in its composer. This tab keeps running.'
            )
          }
        : undefined,
    [agent, pendingItemId, requestRestart, restartable, usable]
  )
  return { fork, restart, openSource: openForkSource }
}
