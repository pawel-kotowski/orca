import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A finished turn's answer in a quiet frame. A wide table, code block or diagram may grow past the
 * prose column (native-chat-markdown.css); the frame then widens with it, and keeps its text at the
 * column's width, so nothing crosses the frame's border.
 */
export function NativeChatAnswerFrame({
  framed,
  children
}: {
  framed: boolean
  children: ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const frame = ref.current
    const column = frame?.parentElement
    if (!framed || !frame || !column) {
      return
    }
    // Why: once the frame widens it no longer knows the column; its row still does.
    const apply = (): void => {
      frame.style.setProperty('--native-chat-answer-column', `${column.clientWidth}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(column)
    return () => observer.disconnect()
  }, [framed])
  return framed ? (
    <div
      ref={ref}
      data-native-chat-turn-answer
      className="native-chat-answer-frame rounded-xl border border-chat-code-border bg-chat-code-surface/40 py-3 pl-6 pr-5"
    >
      {children}
    </div>
  ) : (
    <>{children}</>
  )
}
