import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { NativeChatAwaitingInputRow } from './NativeChatAwaitingInputRow'
import { useNativeChatTerminalBridge } from './native-chat-terminal-bridge'
import { terminalPromptExcerpt } from './native-chat-terminal-prompt-excerpt'

const POLL_MS = 1000

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index])
}

/**
 * The agent waits on its terminal for something this chat has no card for (an MCP form, a
 * subagent's question, a permission prompt it cannot read). Paweł, 2026-11-10: "i didnt see
 * question asked in chat ui". So the row shows what the terminal shows, and a way to answer there.
 */
export function NativeChatTerminalPromptRow(): React.JSX.Element {
  const { readScreen, show } = useNativeChatTerminalBridge()
  const [lines, setLines] = useState<string[]>(() => terminalPromptExcerpt(readScreen?.()))
  useEffect(() => {
    if (!readScreen) {
      return
    }
    // Why polled: the prompt redraws (a moved selection, a typed answer) without any hook.
    const read = (): void => {
      const next = terminalPromptExcerpt(readScreen())
      setLines((current) => (sameLines(current, next) ? current : next))
    }
    read()
    const timer = window.setInterval(read, POLL_MS)
    return () => window.clearInterval(timer)
  }, [readScreen])

  return (
    <div data-native-chat-terminal-prompt className="flex flex-col gap-1.5 pb-2">
      <NativeChatAwaitingInputRow subject={null} pending />
      {lines.length > 0 || show ? (
        <div
          data-native-chat-surface="terminal-prompt"
          className="rounded-lg border border-input bg-card p-3 shadow-xs"
        >
          {lines.length > 0 ? (
            <pre className="scrollbar-sleek max-h-80 overflow-auto font-mono text-xs leading-relaxed whitespace-pre text-chat-foreground">
              {lines.join('\n')}
            </pre>
          ) : null}
          {show ? (
            <Button className={lines.length > 0 ? 'mt-3' : undefined} size="sm" onClick={show}>
              {translate('components.native-chat.question.openTerminal', 'Answer in terminal')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
