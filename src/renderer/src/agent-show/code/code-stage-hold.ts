import { stageHoldRules } from './code-stage-hold-rules'
import { freezeStagePane } from './code-stage-freeze'

// Why a cap: a pane left held by a show that never finished would look stuck.
const MAX_HOLD_MS = 4000

const holds = new Map<string, number>()
const frozen = new Map<string, () => void>()
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
    return
  }
  holds.delete(groupId)
  frozen.get(groupId)?.()
  frozen.delete(groupId)
  drawRules()
}

/**
 * Keeps a stage pane's last picture on screen until the open `holdStageWhile` scope ends: a still
 * copy of the pane covers it (when it has one) and the real pane is hidden, so its mount, font
 * fit, scroll and resizes are never painted half done. Both go a frame after the scope, once
 * Monaco has drawn the final place, so the old picture swaps to the new one in a single frame.
 */
export function holdStagePane(groupId: string): void {
  if (!frozen.has(groupId)) {
    const unfreeze = freezeStagePane(groupId)
    if (unfreeze) {
      frozen.set(groupId, unfreeze)
    }
  }
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
