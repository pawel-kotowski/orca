export type DropIndicator = 'left' | 'right' | null

// Use a visible blue insertion cue above tab borders without changing layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

// Keep the foreground marker above selection/unread layers; zero horizontal inset avoids scrollWidth jitter at the strip’s end.
export const ACTIVE_TAB_INDICATOR_CLASSES =
  'pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-tab-active-indicator z-20 group-data-[single-tab]/tab-strip:hidden'

export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'bg-tab-active text-tab-active-foreground'
    : // Local (glass build): a faint lift on hover, as rows and buttons elsewhere in Orca.
      'bg-tab-inactive text-tab-inactive-foreground hover:text-tab-active-foreground hover:bg-foreground/[0.05]'
}

/**
 * Local (glass build): tabs round their top corners like the rest of Orca's controls and draw no
 * dividing lines, which square-cornered tabs needed and rounded ones do not (Paweł, 2026-11-17:
 * "should tabs be sharp corners? everything in orca is a bit rounded"). The arguments stay for
 * the callers; the top border they controlled is gone with the lines.
 */
export function getTabStripBorderClasses(
  _hasTabsToRight: boolean,
  _options?: { includeTopBorder?: boolean }
): string {
  return 'rounded-t-[7px]'
}
