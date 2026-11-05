import { glassDiagnostic } from '@/lib/glass-diagnostic'
import type { NativeChatSessionTransport } from './native-chat-session-transport'

const wrapped = new WeakMap<NativeChatSessionTransport, NativeChatSessionTransport>()

/**
 * The transport with each read and each stream snapshot logged (glass-diagnostic). Why: after a
 * restart some chats came up empty until a view toggle remounted them, and nothing could be
 * inspected live; these lines show whether the read, the stream or the session id failed.
 */
export function withNativeChatTransportDiagnostics(
  transport: NativeChatSessionTransport
): NativeChatSessionTransport {
  const cached = wrapped.get(transport)
  if (cached) {
    return cached
  }
  const logged: NativeChatSessionTransport = {
    readSession: (agent, sessionId, limit, ...rest) =>
      transport.readSession(agent, sessionId, limit, ...rest).then(
        (result) => {
          glassDiagnostic('chat-read', {
            sessionId,
            limit,
            count: result && !('error' in result) ? result.messages.length : null,
            error: result && 'error' in result ? result.error : null
          })
          return result
        },
        (error: unknown) => {
          glassDiagnostic('chat-read', { sessionId, limit, thrown: String(error) })
          throw error
        }
      ),
    subscribe: (args, onFrame) =>
      transport.subscribe(args, (frame) => {
        if (frame.type === 'snapshot' || frame.type === 'replacement') {
          glassDiagnostic('chat-frame', {
            sessionId: args.sessionId,
            type: frame.type,
            count: 'messages' in frame ? frame.messages.length : null,
            pending: 'pending' in frame ? frame.pending : null,
            error: 'error' in frame ? frame.error : null
          })
        }
        onFrame(frame)
      })
  }
  wrapped.set(transport, logged)
  return logged
}
