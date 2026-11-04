import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import NativeChatView from '../native-chat/NativeChatView'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { ActivityChatPreviewFrame, CROSSFADE_MS } from './activity-thread-chat-preview'
import type { AgentPaneThread } from './activity-thread-types'

/** What the shared chat window shows: a card's chat and what its controls do. */
export type ActivityChatPreviewTarget = {
  thread: AgentPaneThread
  onClose: () => void
  /** The chat's terminal switch: open the agent's own terminal. */
  onShowTerminal: () => void
}

// Why one window for every card: a window per card tore one chat down and built the next on each
// move down the list, so the view blinked. The window stays; its conversation crossfades.
let currentTarget: ActivityChatPreviewTarget | null = null
const targetListeners = new Set<() => void>()

function notifyTarget(): void {
  for (const listener of targetListeners) {
    listener()
  }
}

/** Show a card's chat in the shared window (it replaces the one shown). */
export function showActivityChatPreview(target: ActivityChatPreviewTarget): void {
  currentTarget = target
  notifyTarget()
}

/** Withdraw a card's chat, if it is still the one shown. */
export function hideActivityChatPreview(paneKey: string): void {
  if (currentTarget?.thread.paneKey === paneKey) {
    currentTarget = null
    notifyTarget()
  }
}

function useActivityChatPreviewTarget(): ActivityChatPreviewTarget | null {
  return useSyncExternalStore(
    (listener) => {
      targetListeners.add(listener)
      return () => targetListeners.delete(listener)
    },
    () => currentTarget
  )
}

// The outgoing chat fades out quicker and the incoming one starts a beat later, so over a
// see-through themed window the two texts never sit at full strength on top of each other.
const LEAVE_MS = 130
const ENTER_DELAY_MS = 60
// A chat that has not drawn its first rows by then fades in anyway.
const READY_TIMEOUT_MS = 450

type LayerState = 'pending' | 'shown' | 'leaving'
type Layer = { paneKey: string; state: LayerState }

/** Show the layer for paneKey; whatever was showing starts to leave. */
function showOnly(current: Layer[], paneKey: string): Layer[] {
  return current.map((layer) =>
    layer.paneKey === paneKey
      ? { ...layer, state: 'shown' }
      : layer.state === 'shown'
        ? { ...layer, state: 'leaving' }
        : layer
  )
}

/**
 * The one window for every card's chat. Moving between cards keeps the frame, its place, size and
 * background still; once the next conversation has drawn, the last fades out and it fades in.
 * Closing fades the window out.
 */
export function ActivityChatPreviewHost(): React.JSX.Element | null {
  const target = useActivityChatPreviewTarget()
  const [layers, setLayers] = useState<Layer[]>([])
  const [closing, setClosing] = useState(false)
  const lastTargetRef = useRef<ActivityChatPreviewTarget | null>(null)
  const targetsByPane = useRef(new Map<string, ActivityChatPreviewTarget>())
  if (target) {
    targetsByPane.current.set(target.thread.paneKey, target)
    lastTargetRef.current = target
  }

  useEffect(() => {
    if (!target) {
      if (layers.length === 0) {
        return undefined
      }
      setClosing(true)
      const timer = window.setTimeout(() => {
        setLayers([])
        setClosing(false)
        targetsByPane.current.clear()
      }, CROSSFADE_MS)
      return () => window.clearTimeout(timer)
    }
    setClosing(false)
    const paneKey = target.thread.paneKey
    setLayers((current) => {
      const own = current.find((layer) => layer.paneKey === paneKey)
      if (own?.state === 'shown') {
        return current
      }
      // A chat still drawn (leaving) comes straight back; one never drawn waits its turn.
      if (own?.state === 'leaving') {
        return showOnly(
          current.filter((layer) => layer.state !== 'pending'),
          paneKey
        )
      }
      const kept = current.filter((layer) => layer.state !== 'pending')
      // The first chat shows at once in a fresh window; a switch waits for the next to draw.
      return [...kept, { paneKey, state: kept.length === 0 ? 'shown' : 'pending' }]
    })
    return undefined
    // Why: only the target's identity drives layers; layers are read through the setter.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.thread.paneKey, target === null])

  // Why: a chat whose card scrolled out of the list has no card left to close it on a click
  // outside; the window does that itself.
  const shownPaneKey = target?.thread.paneKey ?? null
  useEffect(() => {
    if (!shownPaneKey) {
      return undefined
    }
    const closeOrphanOnOutsidePointer = (event: PointerEvent): void => {
      const element = event.target instanceof Element ? event.target : null
      if (element?.closest('[data-activity-thread-chat-preview]')) {
        return
      }
      const row = document.querySelector(
        `[data-activity-thread-pane-key="${CSS.escape(shownPaneKey)}"]`
      )
      if (!row) {
        hideActivityChatPreview(shownPaneKey)
      }
    }
    document.addEventListener('pointerdown', closeOrphanOnOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', closeOrphanOnOutsidePointer, true)
  }, [shownPaneKey])

  // Drop chats that have finished leaving.
  const leaving = layers.some((layer) => layer.state === 'leaving')
  useEffect(() => {
    if (!leaving) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      setLayers((current) => current.filter((layer) => layer.state !== 'leaving'))
    }, ENTER_DELAY_MS + CROSSFADE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, layers])

  const reveal = (paneKey: string): void => {
    setLayers((current) =>
      current.some((layer) => layer.paneKey === paneKey && layer.state === 'pending')
        ? showOnly(current, paneKey)
        : current
    )
  }

  if (layers.length === 0) {
    return null
  }
  const first = targetsByPane.current.get(layers[0]!.paneKey) ?? lastTargetRef.current
  if (!first) {
    return null
  }
  return (
    <ActivityChatPreviewFrame
      anchorPaneKey={first.thread.paneKey}
      closing={closing}
      onClose={() => (target ?? lastTargetRef.current)?.onClose()}
      label={(target ?? first).thread.paneTitle || 'Chat'}
    >
      {layers.map((layer) => {
        const layerTarget = targetsByPane.current.get(layer.paneKey)
        return layerTarget ? (
          <ActivityChatPreviewLayer
            key={layer.paneKey}
            target={layerTarget}
            state={layer.state}
            onReady={() => reveal(layer.paneKey)}
          />
        ) : null
      })}
    </ActivityChatPreviewFrame>
  )
}

/** One card's chat inside the shared window, fading in when it has drawn. */
function ActivityChatPreviewLayer({
  target,
  state,
  onReady
}: {
  target: ActivityChatPreviewTarget
  state: LayerState
  onReady: () => void
}): React.JSX.Element {
  const { thread } = target
  const shown = state === 'shown'
  const pending = state === 'pending'
  const layerRef = useRef<HTMLDivElement>(null)
  const leafId = parsePaneKey(thread.paneKey)?.leafId ?? null
  // Why: the composer sends to the pane's live PTY, which the card finds in the tab's layout.
  const ptyId = useAppStore(
    (state) =>
      (leafId
        ? state.terminalLayoutsByTabId[thread.tab.id]?.ptyIdsByLeafId?.[leafId]
        : undefined) ??
      state.ptyIdsByTabId[thread.tab.id]?.[0] ??
      null
  )
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    if (!pending) {
      return
    }
    const startedAt = window.performance.now()
    let frame = 0
    const check = (): void => {
      const drawn = layerRef.current?.querySelector('[data-native-chat-message-id]') != null
      if (drawn || window.performance.now() - startedAt > READY_TIMEOUT_MS) {
        onReadyRef.current()
        return
      }
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [pending])
  return (
    <div
      ref={layerRef}
      className="absolute inset-0 flex min-h-0"
      style={{
        opacity: shown ? 1 : 0,
        transition: shown
          ? `opacity ${CROSSFADE_MS}ms ease-out ${ENTER_DELAY_MS}ms`
          : `opacity ${LEAVE_MS}ms ease-in`,
        pointerEvents: shown ? undefined : 'none'
      }}
      aria-hidden={shown ? undefined : true}
    >
      <NativeChatView
        terminalTabId={thread.tab.id}
        paneKey={thread.paneKey}
        isVisible
        isFocusedGroup={shown}
        targetPtyId={ptyId}
        launchAgent={thread.tab.launchAgent ?? null}
        resolvedAgent={null}
        ownsTabWideLaunchDraft={false}
        onSwitchToTerminal={target.onShowTerminal}
      />
    </div>
  )
}
