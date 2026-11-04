// Keep mounted for fading; hidden state is inert and excluded from assistive technology.

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown } from 'lucide-react'
import { useNativeChatCornerSlot } from './native-chat-corner-slot'
import { translate } from '@/i18n/i18n'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Keeps focus where the reader was typing: a pointer press never moves it here. */
function keepFocus(event: React.MouseEvent): void {
  event.preventDefault()
}

export function NativeChatJumpToLatest({
  visible,
  onJump
}: {
  visible: boolean
  onJump: () => void
}): React.JSX.Element {
  const label = translate('components.native-chat.jumpToLatest', 'Jump to latest')
  const anchorRef = useRef<HTMLSpanElement>(null)
  const slot = useNativeChatCornerSlot(anchorRef)
  if (slot) {
    // Why: in the message box's corner row it takes no room while hidden, so the row stays put.
    return (
      <>
        <span ref={anchorRef} hidden />
        {visible
          ? createPortal(
              <button
                type="button"
                aria-label={label}
                title={label}
                onMouseDown={keepFocus}
                onClick={onJump}
                className={cn(
                  buttonVariants({ variant: 'launcher', size: 'icon' }),
                  'animate-in fade-in-0 slide-in-from-bottom-1 duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:animate-none'
                )}
              >
                <ArrowDown className="size-4" />
              </button>,
              slot
            )
          : null}
      </>
    )
  }
  // Without a message box (a launch prompt) it keeps its own corner over the transcript.
  return (
    <>
      <span ref={anchorRef} hidden />
      <button
        type="button"
        aria-label={label}
        title={label}
        data-shown={visible}
        inert={!visible}
        aria-hidden={!visible || undefined}
        onMouseDown={keepFocus}
        onClick={onJump}
        className={cn(
          buttonVariants({ variant: 'launcher', size: 'icon' }),
          'absolute right-[calc(1rem+var(--native-chat-toggle-clearance,0px))] bottom-3 z-10 transition-[opacity,translate] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-1 data-[shown=false]:opacity-0'
        )}
      >
        <ArrowDown className="size-4" />
      </button>
    </>
  )
}
