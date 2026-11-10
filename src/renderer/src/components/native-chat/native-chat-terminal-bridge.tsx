import { createContext, useContext, useMemo, type ReactNode } from 'react'

/** The terminal behind a terminal-backed chat: read its screen, or switch the pane to it. */
export type NativeChatTerminalBridge = {
  readScreen?: () => string | null
  show?: () => void
}

const NativeChatTerminalBridgeContext = createContext<NativeChatTerminalBridge>({})

// Why a context: the transcript sits several components below the view that owns the terminal,
// and the view in between is at its size limit.
export function NativeChatTerminalBridgeProvider({
  readScreen,
  show,
  children
}: NativeChatTerminalBridge & { children: ReactNode }): React.JSX.Element {
  const value = useMemo(() => ({ readScreen, show }), [readScreen, show])
  return (
    <NativeChatTerminalBridgeContext.Provider value={value}>
      {children}
    </NativeChatTerminalBridgeContext.Provider>
  )
}

export function useNativeChatTerminalBridge(): NativeChatTerminalBridge {
  return useContext(NativeChatTerminalBridgeContext)
}
