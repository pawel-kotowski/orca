import React from 'react'
import { cn } from '@/lib/class-names'
import { observeOffscreenAnimation } from '@/lib/window-activity/offscreen-animation-pause'

const SPINNER_ANIMATION_NAME = 'agent-spinner-rotate'

// Anchor Web Animations only on animationstart for phase sync without recurring JS. Mount-time queries force style recalculation (~24ms/200 mounts).
function syncSpinnerPhase(el: HTMLSpanElement | null): void {
  if (el === null || typeof el.getAnimations !== 'function') {
    return
  }

  const animation = el
    .getAnimations()
    .find(
      (candidate) =>
        'animationName' in candidate && candidate.animationName === SPINNER_ANIMATION_NAME
    )
  if (animation !== undefined) {
    animation.startTime = 0
  }
}

function handleSpinnerAnimationStart(event: React.AnimationEvent<HTMLSpanElement>): void {
  if (event.animationName === SPINNER_ANIMATION_NAME) {
    syncSpinnerPhase(event.currentTarget)
  }
}

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
        // Why no reduced-motion fill (local build): the ring keeps turning; see main.css.
        'agent-working-spinner block rounded-full border-2 border-agent-working border-t-transparent',
        className
      )}
    />
  )
}
