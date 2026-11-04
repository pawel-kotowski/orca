import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useActivityInterruptPrompt } from '@/lib/activity-workbench-visibility'

/**
 * Escape in a working chat, in the activity view: hide the workspace (the default), stop the
 * agent, or neither.
 */
export function ActivityInterruptPrompt(): React.JSX.Element {
  const prompt = useActivityInterruptPrompt()
  return (
    <Dialog open={prompt.open} onOpenChange={(open) => (open ? undefined : prompt.cancel())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {translate('components.activity.interrupt.title', 'The agent is working')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'components.activity.interrupt.description',
              'Hide this workspace and let it keep working, or stop the agent?'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={prompt.cancel}>
            {translate('common.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={prompt.stop}>
            {translate('components.activity.interrupt.stop', 'Stop agent')}
          </Button>
          <Button autoFocus onClick={prompt.hide}>
            {translate('components.activity.interrupt.hide', 'Hide workspace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
