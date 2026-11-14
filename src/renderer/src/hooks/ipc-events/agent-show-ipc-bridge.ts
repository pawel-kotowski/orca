import { dispatchAgentShow } from '@/agent-show/agent-show-dispatcher'

export function registerAgentShowIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(
    window.api.agentShow.onRequest(({ requestId, request, context }) => {
      // Why: main holds the CLI's RPC open until this reply; the dispatcher never rejects.
      void dispatchAgentShow(request, context).then((result) =>
        window.api.agentShow.reply({ requestId, result })
      )
    })
  )
}
