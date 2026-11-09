import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  toggleActivityCardPartsBar,
  useActivityCardPartsBarHidden
} from '../activity/activity-card-parts'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { writeNativeChatAppearance } from '../native-chat/native-chat-appearance-write'

function navHidden(appearance: unknown): boolean {
  return Boolean(
    appearance &&
    typeof appearance === 'object' &&
    (appearance as { sidebarNavHidden?: unknown }).sidebarNavHidden === true
  )
}

/**
 * Whether the sidebar's top block (Search, Tasks, Skills, Agent Dashboard) is hidden, in the
 * Projects and the activity view alike (Paweł, 2026-11-09: "i need option to hide this part of
 * sidebar", "in both views"). Saved as `nativeChatAppearance.sidebarNavHidden`; absent = shown.
 */
export function useSidebarNavHidden(): boolean {
  return useAppStore((state) => navHidden(state.settings?.nativeChatAppearance))
}

function toggleSidebarNav(): void {
  void writeNativeChatAppearance((current) => {
    const rest = { ...current } as Record<string, unknown>
    const hidden = navHidden(current)
    delete rest.sidebarNavHidden
    return hidden ? rest : { ...rest, sidebarNavHidden: true }
  })
}

/** Beside the section title: hides or brings back the block above it. */
export function SidebarNavToggle(): React.JSX.Element {
  const hidden = useSidebarNavHidden()
  const label = hidden
    ? translate('components.sidebar.showNav', 'Show Search, Tasks and Skills')
    : translate('components.sidebar.hideNav', 'Hide Search, Tasks and Skills')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground/70 hover:text-foreground"
          aria-label={label}
          aria-pressed={hidden}
          onClick={toggleSidebarNav}
        >
          {hidden ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** In the activity view, beside the section title: hides or shows the card-part switches. */
export function ActivityCardPartsBarToggle(): React.JSX.Element {
  const hidden = useActivityCardPartsBarHidden()
  const label = hidden
    ? translate('components.activity.cardParts.show', 'Show card contents switches')
    : translate('components.activity.cardParts.hide', 'Hide card contents switches')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            'size-5 text-muted-foreground/70 hover:text-foreground',
            !hidden && 'bg-foreground/10 text-foreground'
          )}
          aria-label={label}
          aria-pressed={!hidden}
          onClick={toggleActivityCardPartsBar}
        >
          <SlidersHorizontal className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
