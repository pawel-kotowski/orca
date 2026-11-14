// Runs inside the guest page via toString(): it must stay self-contained (no imports, no outer names).

export type AgentShowPageMarkSpec = {
  key: string
  label: string
  note: string | null
  codeLabel: string | null
  /** Console prefix main listens for; a click logs `${signal}${key}`. */
  signal: string
}

type MarkParts = {
  element: Element
  box: HTMLElement
  chip: HTMLElement
  bubble: HTMLElement | null
  /** The note shows while pinned by a chip click, hovered, or briefly after it is shown. */
  pinned: boolean
  hovered: boolean
  flashUntil: number
}
type OverlayRegistry = {
  host: HTMLElement
  layer: HTMLElement
  marks: Map<string, MarkParts>
  dispose: () => void
  /** Places every mark now; bubbles avoid the marked elements and earlier bubbles. */
  layout: () => void
}
type OverlayWindow = Window & { __orcaAgentShowOverlay?: OverlayRegistry }

/** Draws (or replaces) one numbered mark over `element`, scrolls it into view, and keeps it following. */
export function installAgentShowMark(
  element: Element,
  spec: AgentShowPageMarkSpec
): { inViewport: boolean } {
  const doc = element.ownerDocument
  const win = doc.defaultView as OverlayWindow
  const ACCENT = '#ffb020'
  const css = (node: HTMLElement, text: string): void => {
    node.style.cssText = text
  }

  type Box = { left: number; top: number; right: number; bottom: number }
  const overlaps = (a: Box, b: Box): boolean =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

  const layoutMarks = (marks: MarkParts[]): void => {
    const rects = marks.map((parts) => parts.element.getBoundingClientRect())
    const shown = rects.map(
      (rect, index) =>
        marks[index]!.element.isConnected &&
        (rect.width > 0 || rect.height > 0) &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < win.innerHeight &&
        rect.left < win.innerWidth
    )
    const taken: Box[] = rects.filter((_rect, index) => shown[index])
    marks.forEach((parts, index) => {
      const rect = rects[index]!
      const noteOpen = parts.pinned || parts.hovered || Date.now() < parts.flashUntil
      for (const node of [parts.box, parts.chip]) {
        node.style.display = shown[index] ? 'block' : 'none'
      }
      if (parts.bubble) {
        parts.bubble.style.display = shown[index] && noteOpen ? 'block' : 'none'
      }
      if (!shown[index]) {
        return
      }
      parts.box.style.left = `${rect.left - 3}px`
      parts.box.style.top = `${rect.top - 3}px`
      parts.box.style.width = `${rect.width + 6}px`
      parts.box.style.height = `${rect.height + 6}px`
      parts.chip.style.left = `${rect.left - 12}px`
      parts.chip.style.top = `${rect.top - 12}px`
      if (!parts.bubble || !noteOpen) {
        return
      }
      const width = parts.bubble.offsetWidth
      const height = parts.bubble.offsetHeight
      const clampX = (x: number): number => Math.max(4, Math.min(x, win.innerWidth - width - 4))
      const candidates = [
        { left: clampX(rect.left), top: rect.bottom + 8 },
        { left: rect.right + 10, top: rect.top },
        { left: clampX(rect.left), top: rect.top - height - 8 },
        { left: rect.left - width - 10, top: rect.top }
      ].map((at) => ({ ...at, right: at.left + width, bottom: at.top + height }))
      const fits = (at: Box): boolean =>
        at.left >= 0 && at.top >= 0 && at.right <= win.innerWidth && at.bottom <= win.innerHeight
      const placed =
        candidates.find((at) => fits(at) && !taken.some((other) => overlaps(at, other))) ??
        candidates.find(fits) ??
        candidates[0]!
      taken.push(placed)
      parts.bubble.style.left = `${placed.left}px`
      parts.bubble.style.top = `${placed.top}px`
    })
  }

  let registry = win.__orcaAgentShowOverlay
  if (!registry || !registry.host.isConnected) {
    const host = doc.createElement('div')
    host.setAttribute('data-orca-agent-show', '')
    css(host, 'position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;')
    const shadow = host.attachShadow({ mode: 'closed' })
    const layer = doc.createElement('div')
    // The top layer keeps marks above modal dialogs and popovers.
    layer.setAttribute('popover', 'manual')
    css(
      layer,
      'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;'
    )
    shadow.appendChild(layer)
    doc.documentElement.appendChild(host)
    try {
      ;(layer as HTMLElement & { showPopover?: () => void }).showPopover?.()
    } catch {
      // Older engines fall back to the host's z-index.
    }
    let frame = 0
    const layout = (): void => {
      frame = 0
      layoutMarks(Array.from(created.marks.values()))
    }
    const schedule = (): void => {
      if (!frame) {
        frame = win.requestAnimationFrame(layout)
      }
    }
    // Layout shifts move elements without a scroll or resize event.
    const interval = win.setInterval(schedule, 400)
    win.addEventListener('scroll', schedule, true)
    win.addEventListener('resize', schedule)
    const created: OverlayRegistry = {
      host,
      layer,
      marks: new Map(),
      layout,
      dispose: () => {
        win.clearInterval(interval)
        win.removeEventListener('scroll', schedule, true)
        win.removeEventListener('resize', schedule)
        host.remove()
        if (win.__orcaAgentShowOverlay === created) {
          delete win.__orcaAgentShowOverlay
        }
      }
    }
    registry = created
    win.__orcaAgentShowOverlay = created
  }

  const previous = registry.marks.get(spec.key)
  previous?.box.remove()
  previous?.chip.remove()
  previous?.bubble?.remove()

  const box = doc.createElement('div')
  // A dark halo around the accent keeps the outline legible on light and dark pages alike.
  css(
    box,
    `position:fixed;box-sizing:border-box;border:2px solid ${ACCENT};border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.55),0 0 0 4px rgba(255,176,32,.22);pointer-events:none;z-index:1;`
  )
  const chip = doc.createElement('div')
  chip.textContent = spec.label
  css(
    chip,
    `position:fixed;min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:10px;background:${ACCENT};color:#1a1a1a;font:700 11px/20px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.45);pointer-events:auto;cursor:pointer;z-index:3;`
  )
  let bubble: HTMLElement | null = null
  if (spec.note || spec.codeLabel) {
    bubble = doc.createElement('div')
    css(
      bubble,
      'position:fixed;max-width:320px;padding:6px 9px;border-radius:6px;background:rgba(24,24,27,.96);color:#f4f4f5;font:12px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:auto;white-space:normal;z-index:2;'
    )
    if (spec.note) {
      const note = doc.createElement('div')
      note.textContent = spec.note
      bubble.appendChild(note)
    }
    if (spec.codeLabel) {
      const code = doc.createElement('button')
      code.type = 'button'
      code.textContent = `${spec.codeLabel} ↗`
      code.title = 'Show this code in Orca'
      css(
        code,
        `display:block;margin-top:${spec.note ? '4px' : '0'};padding:0;border:0;background:none;color:${ACCENT};font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:left;cursor:pointer;text-decoration:underline;`
      )
      const signal = spec.signal + spec.key
      code.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.isTrusted) {
          console.debug(signal)
        }
      })
      bubble.appendChild(code)
    }
  }
  // Why brief: the note is in the chat and on the code card; kept open it covers the page.
  const parts: MarkParts = {
    element,
    box,
    chip,
    bubble,
    pinned: false,
    hovered: false,
    flashUntil: Date.now() + 4000
  }
  const relayout = registry.layout
  let leaveTimer = 0
  const hover = (on: boolean): void => {
    win.clearTimeout(leaveTimer)
    // Why the delay: the pointer crosses a gap between chip and note on its way to the code link.
    leaveTimer = win.setTimeout(
      () => {
        parts.hovered = on
        relayout()
      },
      on ? 0 : 250
    )
  }
  for (const node of [chip, bubble]) {
    node?.addEventListener('mouseenter', () => hover(true))
    node?.addEventListener('mouseleave', () => hover(false))
  }
  chip.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    parts.pinned = !parts.pinned
    parts.flashUntil = 0
    relayout()
  })
  registry.layer.append(box, chip, ...(bubble ? [bubble] : []))
  registry.marks.set(spec.key, parts)

  element.scrollIntoView({ block: 'center', inline: 'nearest' })
  registry.layout()
  const rect = element.getBoundingClientRect()
  return {
    inViewport:
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < win.innerHeight &&
      rect.left < win.innerWidth
  }
}

/** Removes the named marks (all when null); drops the overlay once none remain. */
export function removeAgentShowMarks(win: Window, keys: string[] | null): number {
  const registry = (win as OverlayWindow).__orcaAgentShowOverlay
  if (!registry) {
    return 0
  }
  for (const [key, parts] of Array.from(registry.marks)) {
    if (keys === null || keys.includes(key)) {
      parts.box.remove()
      parts.chip.remove()
      parts.bubble?.remove()
      registry.marks.delete(key)
    }
  }
  if (registry.marks.size === 0) {
    registry.dispose()
  }
  return registry.marks.size
}
