import React from 'react'
import { cn } from '@/lib/class-names'
import { observeOffscreenAnimation } from '@/lib/window-activity/offscreen-animation-pause'
import { handleSpinnerAnimationStart } from '@/components/ui/shared-animation-clock'

// Offscreen rings drop their animation; the restart on reveal re-anchors phase via animationstart.
function observeSpinner(el: HTMLSpanElement): () => void {
  return observeOffscreenAnimation(el)
}

// CSS compositor rotation avoids JS input-thread work; callers provide size.
export function AgentWorkingSpinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      ref={observeSpinner}
      onAnimationStart={handleSpinnerAnimationStart}
      data-agent-spinner=""
      className={cn(
        // Why no reduced-motion fill (local build): the ring keeps turning. The comet look is all in
        // main.css (`.agent-working-spinner`).
        'agent-working-spinner block rounded-full',
        className
      )}
    />
  )
}
