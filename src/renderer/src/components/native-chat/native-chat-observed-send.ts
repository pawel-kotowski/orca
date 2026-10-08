import { sendRuntimePtyInputVerified } from '@/runtime/runtime-terminal-verified-input'
import { enqueueNativeChatPtySend } from './native-chat-pty-send-queue'
import { NATIVE_CHAT_SUBMIT } from './native-chat-send'
import {
  clearConfirmDurationMs,
  clearThenWrite,
  clearUnsubmittedAgentInput,
  type NativeChatSendOptions
} from './native-chat-input-clear'

export const NATIVE_CHAT_RESUBMIT_CHECK_MS = 900
export const NATIVE_CHAT_RESUBMIT_ATTEMPTS = 2

// Why: Claude sometimes drops the delayed Enter, leaving the prompt unsent in its composer while
// chat shows it sent. Re-send Enter only while the composer visibly still holds this prompt.
function resubmitWhilePending(
  submitPending: () => boolean,
  delay: (ms: number, fn: () => void) => void,
  settle: () => void,
  writeEnter: () => Promise<boolean>,
  attempt = 0
): void {
  delay(NATIVE_CHAT_RESUBMIT_CHECK_MS, () => {
    let pending = false
    try {
      pending = attempt < NATIVE_CHAT_RESUBMIT_ATTEMPTS && submitPending()
    } catch {
      // An unreadable terminal is not evidence of a lost Enter.
    }
    if (!pending) {
      settle()
      return
    }
    void writeEnter()
      .catch(() => false)
      .then(() => resubmitWhilePending(submitPending, delay, settle, writeEnter, attempt + 1))
  })
}

export function sendNativeChatObservedWrites(
  ptyId: string,
  writes: readonly { data: string; delayBeforeMs: number }[],
  options: NativeChatSendOptions & { stopOnUnconfirmed?: boolean; settleDelayMs?: number }
) {
  // Dismiss answer cards only after provider acknowledgment.
  const writeOptions = options.onDeliverySettled
    ? ({ requireWriteSettlement: true } as const)
    : undefined
  return enqueueNativeChatPtySend(
    ptyId,
    writes.reduce((total, write) => total + write.delayBeforeMs, 0) +
      clearConfirmDurationMs(options) +
      (options.submitPending ? NATIVE_CHAT_RESUBMIT_CHECK_MS : 0) +
      (options.settleDelayMs ?? 0),
    ({ isCancelled, delay, markSubmitted }) => {
      let reportedUnconfirmed = false
      let acknowledged = true
      const writeAt = (index: number): void => {
        if (isCancelled()) {
          return
        }
        const write = writes[index]
        if (!write) {
          const finish = (): void => {
            options.onDeliverySettled?.(acknowledged)
            markSubmitted()
          }
          const settle = (): void => {
            if (options.settleDelayMs) {
              delay(options.settleDelayMs, finish)
            } else {
              finish()
            }
          }
          if (options.submitPending) {
            resubmitWhilePending(options.submitPending, delay, settle, () =>
              sendRuntimePtyInputVerified(settings, ptyId, NATIVE_CHAT_SUBMIT, 'driving')
            )
          } else {
            settle()
          }
          return
        }
        const send = (): void => {
          if (isCancelled()) {
            return
          }
          void sendRuntimePtyInputVerified(ptyId, write.data, 'driving', writeOptions)
            .then((accepted) => {
              if (isCancelled()) {
                return
              }
              if (!accepted) {
                options.onWriteRejected?.()
                options.onDeliverySettled?.(false)
                markSubmitted()
                return
              }
              writeAt(index + 1)
            })
            // Lost acknowledgments must not replay bytes; submit the possibly delivered body as on the unobserved path.
            .catch(() => {
              if (isCancelled()) {
                return
              }
              acknowledged = false
              if (!reportedUnconfirmed) {
                reportedUnconfirmed = true
                options.onWriteUnconfirmed?.()
              }
              if (options.stopOnUnconfirmed) {
                options.onDeliverySettled?.(false)
                markSubmitted()
                return
              }
              writeAt(index + 1)
            })
        }
        if (write.delayBeforeMs > 0) {
          delay(write.delayBeforeMs, send)
        } else {
          send()
        }
      }
      clearThenWrite(ptyId, options, delay, () => writeAt(0))
    },
    { onCancelUnsubmitted: () => clearUnsubmittedAgentInput(ptyId, options) }
  )
}
