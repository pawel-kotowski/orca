import { Laptop } from 'lucide-react'
import { translate } from '@/i18n/i18n'

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/**
 * Where a card's workspace runs: this computer as its own mark (the Apple logo on a Mac), another
 * machine as a solid tag with its name at full strength (Paweł, 2026-11-08: "for my local
 * workspaces i want apple icon and others should be more visible").
 */
export function ActivityMachineMark({
  remoteName
}: {
  remoteName: string | null
}): React.JSX.Element {
  if (remoteName !== null) {
    return (
      <span
        className="min-w-0 max-w-[30%] shrink-0 truncate rounded-full bg-foreground/[0.1] px-2 text-[10.5px] font-semibold leading-[18px] text-foreground"
        title={remoteName}
      >
        {remoteName}
      </span>
    )
  }
  const label = translate('components.activity.machine.local', 'This computer')
  return (
    <span
      className="inline-flex shrink-0 items-center text-foreground/85"
      title={label}
      aria-label={label}
    >
      {isMac ? (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
      ) : (
        <Laptop className="size-3.5" aria-hidden="true" />
      )}
    </span>
  )
}
