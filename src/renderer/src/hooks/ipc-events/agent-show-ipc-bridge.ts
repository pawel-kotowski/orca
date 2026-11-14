import { clearEverything, dispatchAgentShow } from '@/agent-show/agent-show-dispatcher'
import { startAgentShowPersistence } from '@/agent-show/persistence/agent-show-persistence'

export function registerAgentShowIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(startAgentShowPersistence(clearEverything))
  unsubs.push(
    window.api.agentShow.onRequest(({ requestId, request, context }) => {
      // Why: main holds the CLI's RPC open until this reply; the dispatcher never rejects.
      void dispatchAgentShow(request, context).then((result) =>
        window.api.agentShow.reply({ requestId, result })
      )
    })
  )
}
