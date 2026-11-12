// Local (glass build): a Git Graph tab shows Orca's own Git Graph (ref filter, commit actions)
// or the classic glass-build view (text size, details under the commit, resizable columns,
// lane-coloured badges, find). Why both: upstream shipped its own Git Graph tab (#6746) after the
// glass build had one; until the classic view's features are carried onto Orca's, neither may
// be lost (2026-11-12 merge), so the tab offers both and remembers the choice.
import React, { useState } from 'react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { GitGraphTab } from './git-graph-tab'
import { GitGraphView } from './GitGraphView'

type GitGraphSurfaceView = 'orca' | 'classic'

const VIEW_STORAGE_KEY = 'orca.gitGraph.view'

function readView(): GitGraphSurfaceView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'orca' ? 'orca' : 'classic'
  } catch {
    return 'classic'
  }
}

export function GitGraphSurface({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const [view, setView] = useState(readView)
  const choose = (next: GitGraphSurfaceView): void => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice lasts for this tab only.
    }
  }
  const option = (value: GitGraphSurfaceView, label: string): React.JSX.Element => (
    <button
      type="button"
      aria-pressed={view === value}
      className={cn(
        'h-5 rounded px-2 whitespace-nowrap',
        view === value
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => choose(value)}
    >
      {label}
    </button>
  )
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-7 shrink-0 items-center justify-end gap-1 border-b border-border px-3 text-xs">
        {option('classic', translate('local.gitGraph.classicView', 'Classic view'))}
        {option('orca', translate('local.gitGraph.orcaView', 'Orca view'))}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'orca' ? (
          <GitGraphTab worktreeId={worktreeId} />
        ) : (
          <GitGraphView worktreeId={worktreeId} />
        )}
      </div>
    </div>
  )
}
