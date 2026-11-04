// Keep mounted for fading; hidden state is inert and excluded from assistive technology.

import { ArrowDown } from 'lucide-react'
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
  // Why: same launcher look as the corner buttons; it clears them when they share its row
  // (--native-chat-toggle-clearance, set by the corner buttons; one button's width by default).
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
      className={cn(
        buttonVariants({ variant: 'launcher', size: 'icon' }),
        'absolute right-[calc(1rem+var(--native-chat-toggle-clearance,2.75rem))] bottom-3 z-10 transition-[opacity,translate] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-1 data-[shown=false]:opacity-0'
      )}
    >
      <ArrowDown className="size-4" />
    </button>
  )
}
