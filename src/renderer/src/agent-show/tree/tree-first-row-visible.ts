export const TREE_MARK_PATH_ATTRIBUTE = 'data-agent-show-path'

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node
    }
  }
  return null
}

/** Whether the row of a marked path is drawn and inside the explorer's scroll area. */
export function isTreeRowInView(path: string): boolean {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>(`[${TREE_MARK_PATH_ATTRIBUTE}]`)
  ).find((el) => el.getAttribute(TREE_MARK_PATH_ATTRIBUTE) === path)
  if (!row) {
    return false
  }
  const rect = row.getBoundingClientRect()
  const bounds = scrollParent(row)?.getBoundingClientRect()
  return rect.height > 0 && (bounds ? rect.top >= bounds.top && rect.bottom <= bounds.bottom : true)
}

/** Rows appear after directories load and the list scrolls, so poll briefly. */
export async function waitForTreeRowInView(path: string, timeoutMs = 2500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (isTreeRowInView(path)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return isTreeRowInView(path)
}
