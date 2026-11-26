// Notes on parts of a chat visual (Paweł, 2026-11-26: "i should be able to comment each part").
// The frame stays sandboxed: it draws the pins and reports what was picked; the host keeps the notes.

/** Host → frame: the notes to pin, and whether a click picks a part to comment on. */
export const NATIVE_CHAT_VISUAL_NOTES_TYPE = 'orca-visual-notes'
/** Frame → host: a part was clicked in comment mode. */
export const NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE = 'orca-visual-note-pick'
/** Frame → host: a note's pin was clicked. */
export const NATIVE_CHAT_VISUAL_NOTE_OPEN_TYPE = 'orca-visual-note-open'
/** Frame → host: which notes found no part to pin on (the page changed). */
export const NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE = 'orca-visual-note-anchors'
/** Frame → host: Escape inside the page left comment mode. */
export const NATIVE_CHAT_VISUAL_NOTE_CANCEL_TYPE = 'orca-visual-note-cancel'

/** A pin as the page draws it. */
export type NativeChatVisualNotePin = {
  id: string
  /** Its number on the pin, in the order the notes list them. */
  n: number
  selector: string
  text: string
  show?: string
  resolved: boolean
  active: boolean
}

/** The part a click picked: how to find it again, and what it said. */
export type NativeChatVisualNotePick = { selector: string; text: string; show?: string }

export type NativeChatVisualNoteMessage =
  | ({ kind: 'note-pick' } & NativeChatVisualNotePick)
  | { kind: 'note-open'; id: string }
  | { kind: 'note-anchors'; missing: string[] }
  | { kind: 'note-cancel' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** A note message from a visual's shell on `channel`, validated; null for anything else. */
export function readNativeChatVisualNoteMessage(
  data: unknown,
  channel: string
): NativeChatVisualNoteMessage | null {
  if (!isRecord(data) || data.channel !== channel) {
    return null
  }
  if (data.type === NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE) {
    const { selector, text, show } = data
    if (typeof selector !== 'string' || selector.length === 0 || typeof text !== 'string') {
      return null
    }
    return {
      kind: 'note-pick',
      selector,
      text,
      ...(typeof show === 'string' && show.length > 0 ? { show } : {})
    }
  }
  if (data.type === NATIVE_CHAT_VISUAL_NOTE_OPEN_TYPE) {
    return typeof data.id === 'string' && data.id.length > 0
      ? { kind: 'note-open', id: data.id }
      : null
  }
  if (data.type === NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE) {
    const listed: unknown = data.missing
    if (!Array.isArray(listed)) {
      return null
    }
    const missing = listed.filter((id): id is string => typeof id === 'string')
    return missing.length === listed.length ? { kind: 'note-anchors', missing } : null
  }
  if (data.type === NATIVE_CHAT_VISUAL_NOTE_CANCEL_TYPE) {
    return { kind: 'note-cancel' }
  }
  return null
}

export function nativeChatVisualNotesMessage(
  channel: string,
  pins: readonly NativeChatVisualNotePin[],
  commentMode: boolean
): {
  type: string
  channel: string
  pins: readonly NativeChatVisualNotePin[]
  commentMode: boolean
} {
  return { type: NATIVE_CHAT_VISUAL_NOTES_TYPE, channel, pins, commentMode }
}

const PIN_CSS = [
  '[data-orca-note-layer]{position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none}',
  '[data-orca-note-pin]{position:absolute;display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:11px 11px 11px 2px;background:var(--primary,#2563eb);color:var(--primary-foreground,#fff);font:600 12px/1 var(--font-sans,system-ui,sans-serif);box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:pointer;pointer-events:auto;transform:translate(-4px,-100%)}',
  '[data-orca-note-pin][data-resolved="true"]{background:var(--muted,#e5e5e5);color:var(--muted-foreground,#666)}',
  '[data-orca-note-pin][data-active="true"]{outline:2px solid var(--ring,var(--primary,#2563eb));outline-offset:2px}',
  '[data-orca-note-box]{position:absolute;box-sizing:border-box;border:2px solid var(--primary,#2563eb);border-radius:4px;background:color-mix(in srgb,var(--primary,#2563eb) 8%,transparent);pointer-events:none}',
  '[data-orca-note-box][data-kind="active"]{border-style:solid;background:transparent}',
  'html[data-orca-comment-mode] body, html[data-orca-comment-mode] body *{cursor:crosshair !important}'
].join('')

/** The page side, plain ES5 after the shell's own script: pins, the hover box and picks. */
export function nativeChatVisualNoteBridgeScript(channel: string): string {
  const constants = JSON.stringify({
    channel,
    notes: NATIVE_CHAT_VISUAL_NOTES_TYPE,
    pick: NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE,
    open: NATIVE_CHAT_VISUAL_NOTE_OPEN_TYPE,
    anchors: NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE,
    cancel: NATIVE_CHAT_VISUAL_NOTE_CANCEL_TYPE,
    css: PIN_CSS
  })
  return `(function () {
'use strict'
var C = ${constants}
var host = window.parent
var pins = []
var commentMode = false
var layer = null
var hoverBox = null
function send(message) {
  message.channel = C.channel
  try { host.postMessage(message, '*') } catch (_) {}
}
function textOf(el) {
  return String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim()
}
function escapeId(id) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(id)
  return id.replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\\\' + c })
}
function selectorOf(el) {
  var parts = []
  while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
    if (el.id) {
      var byId = '#' + escapeId(el.id)
      var matches = []
      try { matches = document.querySelectorAll(byId) } catch (_) {}
      if (matches.length === 1) { parts.unshift(byId); return parts.join(' > ') }
    }
    var tag = el.tagName.toLowerCase()
    var index = 1
    var sibling = el
    while ((sibling = sibling.previousElementSibling)) { if (sibling.tagName === el.tagName) index++ }
    parts.unshift(tag + ':nth-of-type(' + index + ')')
    el = el.parentElement
  }
  parts.unshift('body')
  return parts.join(' > ')
}
function isOurs(node) {
  return !!(node && node.closest && node.closest('[data-orca-note-layer]'))
}
function partOf(node) {
  while (node && node.nodeType !== 1) node = node.parentNode
  if (!node || isOurs(node) || node === document.body || node === document.documentElement) return null
  var shown = node.closest ? node.closest('[data-orca-show]') : null
  return shown || node
}
function findAnchor(pin) {
  var el = null
  try { el = document.querySelector(pin.selector) } catch (_) {}
  if (el && !isOurs(el) && textOf(el) === pin.text) return el
  if (pin.show) {
    var shown = document.querySelectorAll('[data-orca-show]')
    for (var i = 0; i < shown.length; i++) {
      if (shown[i].getAttribute('data-orca-show') === pin.show) return shown[i]
    }
  }
  if (pin.text) {
    var all = document.body ? document.body.getElementsByTagName('*') : []
    var best = null
    for (var j = 0; j < all.length; j++) {
      if (!isOurs(all[j]) && textOf(all[j]) === pin.text) best = all[j]
    }
    if (best) return best
  }
  return el && !isOurs(el) ? el : null
}
function ensureLayer() {
  if (layer && layer.parentNode) return layer
  var style = document.createElement('style')
  style.textContent = C.css
  document.documentElement.appendChild(style)
  layer = document.createElement('div')
  layer.setAttribute('data-orca-note-layer', '')
  document.documentElement.appendChild(layer)
  return layer
}
function placeBox(box, rect) {
  box.style.left = (rect.left + window.scrollX - 3) + 'px'
  box.style.top = (rect.top + window.scrollY - 3) + 'px'
  box.style.width = (rect.width + 6) + 'px'
  box.style.height = (rect.height + 6) + 'px'
}
var drawn = ''
var lastActive = null
function draw() {
  var target = ensureLayer()
  var missing = []
  var html = []
  var boxes = []
  for (var i = 0; i < pins.length; i++) {
    var pin = pins[i]
    var el = findAnchor(pin)
    if (!el) { missing.push(pin.id); continue }
    if (pin.active && pin.id !== lastActive && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    var rect = el.getBoundingClientRect()
    boxes.push({ pin: pin, rect: rect })
  }
  lastActive = null
  for (var a = 0; a < pins.length; a++) if (pins[a].active) lastActive = pins[a].id
  while (target.firstChild) target.removeChild(target.firstChild)
  for (var k = 0; k < boxes.length; k++) {
    var entry = boxes[k]
    if (entry.pin.active) {
      var box = document.createElement('div')
      box.setAttribute('data-orca-note-box', '')
      box.setAttribute('data-kind', 'active')
      placeBox(box, entry.rect)
      target.appendChild(box)
    }
    var dot = document.createElement('div')
    dot.setAttribute('data-orca-note-pin', entry.pin.id)
    dot.setAttribute('data-resolved', entry.pin.resolved ? 'true' : 'false')
    dot.setAttribute('data-active', entry.pin.active ? 'true' : 'false')
    dot.textContent = String(entry.pin.n)
    dot.style.left = (entry.rect.right + window.scrollX - 14) + 'px'
    dot.style.top = (entry.rect.top + window.scrollY + 4) + 'px'
    target.appendChild(dot)
  }
  if (hoverBox) target.appendChild(hoverBox)
  var report = missing.join('\\n')
  if (report !== drawn) { drawn = report; send({ type: C.anchors, missing: missing }) }
}
var pending = false
function schedule() {
  if (pending || pins.length === 0) return
  pending = true
  var run = function () { pending = false; draw() }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else setTimeout(run, 16)
}
function setHover(el) {
  if (!commentMode || !el) {
    if (hoverBox && hoverBox.parentNode) hoverBox.parentNode.removeChild(hoverBox)
    hoverBox = null
    return
  }
  var target = ensureLayer()
  if (!hoverBox) {
    hoverBox = document.createElement('div')
    hoverBox.setAttribute('data-orca-note-box', '')
  }
  placeBox(hoverBox, el.getBoundingClientRect())
  if (hoverBox.parentNode !== target) target.appendChild(hoverBox)
}
window.addEventListener('message', function (event) {
  var data = event.data
  if (event.source !== host || !data || data.channel !== C.channel || data.type !== C.notes) return
  pins = Array.isArray(data.pins) ? data.pins : []
  commentMode = data.commentMode === true
  if (commentMode) document.documentElement.setAttribute('data-orca-comment-mode', '')
  else { document.documentElement.removeAttribute('data-orca-comment-mode'); setHover(null) }
  drawn = null
  draw()
})
window.addEventListener('click', function (event) {
  var node = event.target
  while (node && node.nodeType !== 1) node = node.parentNode
  var pin = node && node.closest ? node.closest('[data-orca-note-pin]') : null
  if (pin) {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.isTrusted) send({ type: C.open, id: pin.getAttribute('data-orca-note-pin') })
    return
  }
  if (!commentMode) return
  event.preventDefault()
  event.stopImmediatePropagation()
  var part = partOf(node)
  if (!part || !event.isTrusted) return
  setHover(null)
  var pick = { type: C.pick, selector: selectorOf(part), text: textOf(part) }
  var show = part.getAttribute('data-orca-show')
  if (show) pick.show = show
  send(pick)
}, true)
document.addEventListener('mouseover', function (event) { if (commentMode) setHover(partOf(event.target)) }, true)
document.addEventListener('mouseleave', function () { setHover(null) })
document.addEventListener('keydown', function (event) {
  if (commentMode && event.key === 'Escape') { event.preventDefault(); send({ type: C.cancel }) }
}, true)
window.addEventListener('resize', schedule)
window.addEventListener('load', schedule)
if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.documentElement)
if (typeof MutationObserver === 'function') {
  document.addEventListener('DOMContentLoaded', function () {
    if (document.body) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}
})()`
}
