// Runs inside the guest page via toString(): it must stay self-contained (no imports, no outer names).

export type AgentShowTargetMatch = {
  element: Element | null
  matches: number
  visibleMatches: number
  error?: string
}

/** Finds a page element by CSS selector or visible text, preferring the first visible match. */
export function findAgentShowTarget(
  doc: Document,
  target: { selector?: string; text?: string }
): AgentShowTargetMatch {
  const isVisible = (element: Element): boolean => {
    if (element.getClientRects().length === 0) {
      return false
    }
    const style = doc.defaultView?.getComputedStyle(element)
    return !style || (style.visibility !== 'hidden' && style.display !== 'none')
  }
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()

  let candidates: Element[] = []
  if (target.selector) {
    try {
      candidates = Array.from(doc.querySelectorAll(target.selector))
    } catch {
      return { element: null, matches: 0, visibleMatches: 0, error: 'invalid CSS selector' }
    }
  } else if (target.text) {
    const wanted = normalize(target.text)
    const root = doc.body ?? doc.documentElement
    const containing = Array.from(root.querySelectorAll('*')).filter(
      (element) =>
        element.tagName !== 'SCRIPT' &&
        element.tagName !== 'STYLE' &&
        normalize(element.textContent ?? '').includes(wanted)
    )
    // The innermost element holding the whole text, not every ancestor that also contains it.
    candidates = containing.filter(
      (element) => !Array.from(element.children).some((child) => containing.includes(child))
    )
  }
  const visible = candidates.filter(isVisible)
  return {
    element: visible[0] ?? candidates[0] ?? null,
    matches: candidates.length,
    visibleMatches: visible.length
  }
}
