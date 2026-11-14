import { useLayoutEffect, useRef } from 'react'
import { getDiffCommentLineMetaLabel } from '@/components/diff-comments/diff-comment-line-meta-label'
import { useTranslate } from '@/i18n/use-translate'
import type { CodeMark } from './code-mark-store'

// Read-only sibling of DiffCommentCard: same chrome, the agent's mark and note, no actions.
export function AgentShowNoteCard({
  mark,
  onResize
}: {
  mark: CodeMark
  onResize: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  // Monaco zones never remeasure; follow the card's real height as the pane narrows.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === 'undefined') {
      return
    }
    onResizeRef.current()
    const observer = new ResizeObserver(() => onResizeRef.current())
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={cardRef} className="orca-diff-comment-card orca-agent-show-note-card">
      <div className="orca-diff-comment-content-col">
        <div className="orca-diff-comment-header">
          <div className="orca-diff-comment-meta-group">
            <span className="orca-agent-show-mark-badge">{mark.mark}</span>
            {getDiffCommentLineMetaLabel(
              { lineNumber: mark.endLine, startLine: mark.startLine },
              t
            )}
          </div>
        </div>
        <div className="orca-diff-comment-body">{mark.note}</div>
      </div>
    </div>
  )
}
