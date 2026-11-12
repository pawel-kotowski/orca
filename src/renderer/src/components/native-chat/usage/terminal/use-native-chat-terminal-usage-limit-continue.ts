import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from 'react'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../../../../shared/workspace-layout/stable-pane-id'
import {
  isNativeChatUsageLimitCutSchedulable,
  type NativeChatUsageLimitCut
} from '../../../../../../shared/native-chat/native-chat-usage-limit-cut'
import type { NativeChatUsageLimitAutoContinueState } from '../NativeChatUsageLimitAutoContinue'
import {
  terminalAutoContinueSettled,
  terminalContinueAfterSwitch
} from './native-chat-terminal-pane-store'
import {
  nativeChatContinueAfterSwitchStep,
  withNewPtySeen
} from './native-chat-terminal-continue-after-switch'

/** As the structured host does: a reset is not trusted to the second. */
const AUTO_CONTINUE_GRACE_MS = 15_000
// Why polling, not one long timeout: a sleeping Mac stalls timers, and the reset may pass meanwhile.
const CHECK_EVERY_MS = 30_000

/** Keeps the latest send in a ref so timers armed earlier send through today's composer. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

const invalidatedByClock = (): (() => void) => () => {}

/**
 * The terminal chat's continue at the reset, under the same setting as the structured chat's.
 * Orca's host continues a structured chat; a terminal chat has no host turn, so this renderer
 * types the continue itself while the chat is open.
 */
export function useNativeChatTerminalUsageLimitAutoContinue(
  paneKey: string,
  cut: NativeChatUsageLimitCut | null,
  continueNow: () => void
): NativeChatUsageLimitAutoContinueState | null {
  const enabled = useAppStore((s) => s.settings?.nativeChatAutoContinueAfterUsageLimit === true)
  const settled = terminalAutoContinueSettled.useValue(paneKey)
  const turnItemId = cut?.turnItemId
  const resetsAt = cut?.resetsAt
  const turnEndedAt = cut?.turnEndedAt
  const settledHow = settled && settled.turnItemId === turnItemId ? settled.how : null
  // Fresh wall time decides; a re-render is all a clock tick could add.
  const schedulable = useSyncExternalStore(
    invalidatedByClock,
    () =>
      turnItemId !== undefined &&
      isNativeChatUsageLimitCutSchedulable({ turnItemId, resetsAt, turnEndedAt }, Date.now())
  )
  const send = useLatest(continueNow)
  const due = enabled && schedulable && settledHow === null && resetsAt !== undefined
  useEffect(() => {
    if (!due || turnItemId === undefined || resetsAt === undefined) {
      return
    }
    const check = (): void => {
      // Read the store, not this render: a timer due at the same time may have sent already.
      if (
        Date.now() < resetsAt + AUTO_CONTINUE_GRACE_MS ||
        terminalAutoContinueSettled.get(paneKey)?.turnItemId === turnItemId
      ) {
        return
      }
      terminalAutoContinueSettled.set(paneKey, { turnItemId, how: 'sent' })
      send.current()
    }
    const first = setTimeout(check, Math.max(0, resetsAt + AUTO_CONTINUE_GRACE_MS - Date.now()))
    const every = setInterval(check, CHECK_EVERY_MS)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      window.removeEventListener('focus', check)
    }
  }, [due, paneKey, turnItemId, resetsAt, send])
  const cancel = useCallback(() => {
    if (turnItemId !== undefined) {
      terminalAutoContinueSettled.set(paneKey, { turnItemId, how: 'cancelled' })
    }
  }, [paneKey, turnItemId])
  return useMemo(() => {
    if (!schedulable || resetsAt === undefined || settledHow === 'sent') {
      return null
    }
    if (settledHow === 'cancelled') {
      return { kind: 'cancelled' }
    }
    return enabled ? { kind: 'scheduled', resetsAt, cancel } : { kind: 'off' }
  }, [schedulable, resetsAt, settledHow, enabled, cancel])
}

/** The pane's PTY as the tab's layout binds it now. */
export function useNativeChatPanePtyId(paneKey: string, terminalTabId: string): string | null {
  const leafId = parsePaneKey(paneKey)?.leafId
  return useAppStore((s) =>
    leafId ? (s.terminalLayoutsByTabId[terminalTabId]?.ptyIdsByLeafId?.[leafId] ?? null) : null
  )
}

/** Types Continue once Claude has restarted on the account the person switched to. */
export function useNativeChatTerminalContinueAfterSwitch(
  paneKey: string,
  terminalTabId: string,
  cutTurnItemId: string | null,
  continueNow: () => void
): void {
  const armed = terminalContinueAfterSwitch.useValue(paneKey)
  const ptyId = useNativeChatPanePtyId(paneKey, terminalTabId)
  const oldPtyId = armed?.oldPtyId
  const restartQueued = useAppStore((s) =>
    oldPtyId === undefined ? false : s.pendingPaneAccountRestarts[oldPtyId] !== undefined
  )
  const statusState = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state ?? null)
  const statusUpdatedAt = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.updatedAt ?? null)
  const send = useLatest(continueNow)
  useEffect(() => {
    if (!armed) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (): void => {
      clearTimeout(timer)
      const current = terminalContinueAfterSwitch.get(paneKey)
      if (!current) {
        return
      }
      const now = Date.now()
      const seen = withNewPtySeen(current, ptyId, now)
      if (seen !== current) {
        // The store change re-runs this effect with the new record.
        terminalContinueAfterSwitch.set(paneKey, seen)
        return
      }
      const step = nativeChatContinueAfterSwitchStep(
        current,
        {
          cutTurnItemId,
          ptyId,
          restartQueued,
          status:
            statusState === null || statusUpdatedAt === null
              ? null
              : { state: statusState, updatedAt: statusUpdatedAt }
        },
        now
      )
      if (step.kind === 'wait') {
        timer = step.until === undefined ? undefined : setTimeout(check, step.until - now)
        return
      }
      terminalContinueAfterSwitch.set(paneKey, undefined)
      if (step.kind === 'send') {
        send.current()
      }
    }
    check()
    const every = setInterval(check, CHECK_EVERY_MS)
    return () => {
      clearTimeout(timer)
      clearInterval(every)
    }
  }, [armed, paneKey, ptyId, restartQueued, statusState, statusUpdatedAt, cutTurnItemId, send])
}
