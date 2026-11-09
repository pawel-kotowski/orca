import { History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isAiVaultAgent } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { useNativeChatAccountScope } from './native-chat-account-usage'
import { openNativeChatSessionHistory } from './use-native-chat-resume-command'

/**
 * Resume another conversation from the chat (Paweł, 2026-11-09: "i see resume slash command but i
 * need selection ui, just add button for resume"): opens Session History, where a pick resumes in
 * a terminal as the history panel does.
 */
export function NativeChatResumeButton(): React.JSX.Element | null {
  const scope = useNativeChatAccountScope()
  if (!scope || !isAiVaultAgent(scope.agent)) {
    return null
  }
  const label = translate('components.native-chat.resumeButton', 'Resume a conversation')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="text-chat-foreground-faint hover:text-chat-foreground"
          onClick={() => {
            const unavailable = openNativeChatSessionHistory({
              terminalTabId: scope.terminalTabId,
              agent: scope.agent as AgentType,
              resumesInPlace: false,
              search: ''
            })
            if (unavailable) {
              toast.warning(unavailable)
            }
          }}
        >
          <History className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
