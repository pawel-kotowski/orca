import { stageHoldRules } from './code-stage-hold-rules'

// Why a cap: a pane left hidden by a show that never finished would look like a blank editor.
const MAX_HOLD_MS = 4000

const holds = new Map<string, number>()
let scopeDepth = 0
let deferred: (() => void)[] = []
let styleElement: HTMLStyleElement | null = null

function drawRules(): void {
  styleElement ??= document.head.appendChild(document.createElement('style'))
  styleElement.textContent = stageHoldRules([...holds.keys()])
}

function unhold(groupId: string): void {
  const count = (holds.get(groupId) ?? 0) - 1
  if (count > 0) {
    holds.set(groupId, count)
  } else {
    holds.delete(groupId)
  }
  drawRules()
}

/**
 * Hides the editor in a stage pane until the open `holdStageWhile` scope ends, so its mount,
 * font fit, scroll and resizes are never painted half done. It shows again a frame after the
 * scope, once Monaco has drawn the final place.
 */
export function holdStagePane(groupId: string): void {
  holds.set(groupId, (holds.get(groupId) ?? 0) + 1)
  drawRules()
  let released = false
  const release = (): void => {
    if (released) {
      return
    }
    released = true
    clearTimeout(cap)
    requestAnimationFrame(() => unhold(groupId))
  }
  const cap = setTimeout(release, MAX_HOLD_MS)
  if (scopeDepth > 0) {
    deferred.push(release)
  } else {
    release()
  }
}

/** Runs `stage`; every pane held inside it shows again together when all of it has landed. */
export async function holdStageWhile<T>(stage: () => Promise<T>): Promise<T> {
  scopeDepth += 1
  try {
    return await stage()
  } finally {
    scopeDepth -= 1
    if (scopeDepth === 0) {
      const releases = deferred
      deferred = []
      releases.forEach((release) => release())
    }
  }
}
