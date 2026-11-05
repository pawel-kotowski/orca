// Why a tick, not one setTimeout: a Keychain prompt at launch can freeze the main thread for
// minutes. A plain 60 s timer then fires the moment main wakes, as if the daemon had hung, and the
// whole session falls back to in-process terminals that cannot reach the agents running in the
// daemon (each agent pane then resumed a second copy of its conversation). Counting only time the
// event loop actually ran keeps the deadlock breaker for a daemon that really hangs.
const TICK_MS = 1_000
// A tick that arrives this late means main was frozen; its gap is not waiting on the daemon.
const FROZEN_GAP_MS = 5_000

/** Calls onExpire after `ms` of responsive main-thread time; returns a cancel function. */
export function startResponsiveTimeout(
  ms: number,
  onExpire: () => void,
  now: () => number = Date.now
): () => void {
  let waited = 0
  let last = now()
  const timer = setInterval(() => {
    const current = now()
    const gap = current - last
    last = current
    waited += gap > FROZEN_GAP_MS ? TICK_MS : gap
    if (waited >= ms) {
      clearInterval(timer)
      onExpire()
    }
  }, TICK_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}
