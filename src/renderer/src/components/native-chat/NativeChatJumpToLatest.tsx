// The way back to the latest message once the reader has scrolled up.
//
// It stays mounted so it can fade rather than pop, and while hidden it is inert
// and hidden from assistive tech, so it can be neither clicked, tabbed to nor read.

import { ArrowDown } from 'lucide-react'
import { translate } from '@/i18n/i18n'

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
  // Why: sits just left of the message box toggle (36px + 8px gap) and follows its shift.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-shown={visible}
      inert={!visible}
      aria-hidden={!visible || undefined}
      onMouseDown={keepFocus}
      onClick={onJump}
      className="absolute right-[calc(3.75rem+var(--native-chat-toggle-shift,0px))] bottom-3 z-10 flex size-9 items-center justify-center rounded-lg border border-border bg-popover text-popover-foreground shadow-floating transition-[opacity,translate] duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-1 data-[shown=false]:opacity-0"
    >
      <ArrowDown className="size-4" />
    </button>
  )
}
