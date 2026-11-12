import { useCallback, useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import { translate } from '@/i18n/i18n'
import { NATIVE_CHAT_USAGE_LIMIT_CONTINUE_MESSAGE } from '../../../../../../shared/native-chat/native-chat-usage-limit-cut'
import { latestNativeChatTerminalUsageLimitCut } from '../../../../../../shared/native-chat/native-chat-terminal-usage-limit-cut'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { ClaudeManagedAccount } from '../../../../../../shared/managed-account-types'
import {
  NativeChatOrcaStopContext,
  type NativeChatOrcaStopView
} from '../../messages/notices/native-chat-orca-stop-context'
import type { NativeChatComposerHandle } from '../../composer/native-chat-composer-types'
import type { NativeChatComposerNotice } from '../../composer/controls/native-chat-composer-notice'
import { UsageLimitActionsContext, type UsageLimitActions } from '../NativeChatUsageLimitActions'
import { switchChatAccount } from '../../native-chat-account-switch'
import { accountShortName } from '../../native-chat-account-usage'
import {
  terminalContinueAfterSwitch,
  terminalContinueError
} from './native-chat-terminal-pane-store'
import {
  useNativeChatPanePtyId,
  useNativeChatTerminalContinueAfterSwitch,
  useNativeChatTerminalUsageLimitAutoContinue
} from './use-native-chat-terminal-usage-limit-continue'
import { NativeChatTerminalUsageLimitAccountMenu } from './NativeChatTerminalUsageLimitAccountMenu'

const noop = (): void => {}

/**
 * The structured chat's usage-limit actions for a terminal-backed chat: Continue types "Continue
 * where you left off." into the agent's terminal through the composer's own send (echo, delivery
 * check and all); a Claude chat can move to another account and continue there; and the
 * Continue-at-reset setting works here too. Hand off is the pane's own (its right-click item), which
 * builds the hand-off from the terminal's session.
 */
export function NativeChatTerminalUsageLimitProvider({
  paneKey,
  terminalTabId,
  agent,
  transcriptPath,
  messages,
  isWorking,
  composerRef,
  handOff,
  children
}: {
  paneKey: string
  terminalTabId: string
  agent: string
  transcriptPath: string | null
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  composerRef: RefObject<NativeChatComposerHandle | null> | undefined
  handOff?: (() => void) | undefined
  children: ReactNode
}): React.JSX.Element {
  const cut = useMemo(() => latestNativeChatTerminalUsageLimitCut(messages), [messages])
  const cutId = cut?.turnItemId ?? null
  const offered = cut !== null && !isWorking ? cut : null
  // A failed Continue belongs to its cut: once the cut is gone, so is the error.
  useEffect(() => {
    const shown = terminalContinueError.get(paneKey)
    if (shown && shown.key !== continueErrorKey(cutId)) {
      terminalContinueError.set(paneKey, undefined)
    }
  }, [paneKey, cutId])
  const continueNow = useCallback(
    (hadFocus = false): void => {
      if (cutId === null) {
        return
      }
      const composer = composerRef?.current
      const sent = composer?.resend?.(NATIVE_CHAT_USAGE_LIMIT_CONTINUE_MESSAGE) === true
      terminalContinueError.set(paneKey, sent ? undefined : continueFailedNotice(paneKey, cutId))
      if (sent && hadFocus) {
        composer?.focus()
      }
    },
    [composerRef, cutId, paneKey]
  )
  const sendContinue = useCallback(() => continueNow(), [continueNow])
  const autoContinue = useNativeChatTerminalUsageLimitAutoContinue(paneKey, offered, sendContinue)
  useNativeChatTerminalContinueAfterSwitch(paneKey, terminalTabId, cutId, sendContinue)
  const waiting = terminalContinueAfterSwitch.useValue(paneKey)
  const ptyId = useNativeChatPanePtyId(paneKey, terminalTabId)
  const onSwitch = useCallback(
    (worktreeId: string, account: ClaudeManagedAccount) => {
      switchChatAccount({ worktreeId, terminalTabId, account })
      if (cutId !== null && ptyId) {
        terminalContinueAfterSwitch.set(paneKey, {
          turnItemId: cutId,
          oldPtyId: ptyId,
          armedAt: Date.now(),
          accountName: accountShortName(account.email)
        })
      }
    },
    [cutId, paneKey, ptyId, terminalTabId]
  )
  const offeredId = offered?.turnItemId ?? null
  const waitingOn = waiting && waiting.turnItemId === offeredId ? waiting.accountName : null
  const actions = useMemo<UsageLimitActions>(
    () => ({
      account:
        agent === 'claude' && offeredId !== null ? (
          <NativeChatTerminalUsageLimitAccountMenu
            terminalTabId={terminalTabId}
            transcriptPath={transcriptPath}
            waitingOn={waitingOn}
            onSwitch={onSwitch}
          />
        ) : null,
      ...(handOff && offeredId !== null ? { handOff } : {}),
      disabled: false
    }),
    [agent, offeredId, terminalTabId, transcriptPath, waitingOn, onSwitch, handOff]
  )
  const view = useMemo<NativeChatOrcaStopView>(
    () => ({
      hostLabel: null,
      remoteHost: false,
      continueAvailable: false,
      offeredTurnItemId: null,
      continueNow: noop,
      usageLimitTurnItemId: offeredId,
      usageLimitAutoContinue: autoContinue,
      continueUsageLimit: continueNow
    }),
    [offeredId, autoContinue, continueNow]
  )
  return (
    <UsageLimitActionsContext.Provider value={actions}>
      <NativeChatOrcaStopContext.Provider value={view}>
        {children}
      </NativeChatOrcaStopContext.Provider>
    </UsageLimitActionsContext.Provider>
  )
}

function continueErrorKey(cutId: string | null): string {
  return `usage-limit-continue:${cutId ?? ''}`
}

function continueFailedNotice(paneKey: string, cutId: string): NativeChatComposerNotice {
  return {
    key: continueErrorKey(cutId),
    kind: 'error',
    text: translate(
      'components.native-chat.interruptedContinue.failed',
      "Couldn't continue this chat. Try again, or send a message."
    ),
    onDismiss: () => terminalContinueError.set(paneKey, undefined)
  }
}
