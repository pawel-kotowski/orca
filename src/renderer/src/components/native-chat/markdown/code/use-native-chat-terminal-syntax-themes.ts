import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { applyTerminalSyntaxThemes } from '@/lib/syntax-highlighting/syntax-highlighter'
import { nativeChatColors } from '../../../../../../shared/native-chat/native-chat-appearance-settings'

type TerminalThemeNames = { light: string | null; dark: string | null }

const NO_THEMES: TerminalThemeNames = { light: null, dark: null }

/** The terminal themes whose syntax colours the chat's code takes; none while the chat is monochrome. */
export function terminalSyntaxThemeNames(
  settings:
    | (NonNullable<Parameters<typeof nativeChatColors>[0]> & {
        terminalThemeDark?: string
        terminalThemeLight?: string
        terminalUseSeparateLightTheme?: boolean
      })
    | null
    | undefined
): TerminalThemeNames {
  if (!settings || !nativeChatColors(settings)) {
    return NO_THEMES
  }
  const dark = settings.terminalThemeDark || null
  const light = settings.terminalUseSeparateLightTheme ? settings.terminalThemeLight || null : dark
  return { light, dark }
}

// Why the guard: some tests stand a plain object in for the store; Light+/Dark+ hold there.
const useTerminalThemeNames: () => [string | null, string | null] =
  typeof useAppStore === 'function'
    ? () => {
        const light = useAppStore((state) => terminalSyntaxThemeNames(state.settings).light)
        const dark = useAppStore((state) => terminalSyntaxThemeNames(state.settings).dark)
        return [light, dark]
      }
    : () => [null, null]

/** Local build: the chat's code takes the terminal theme's syntax colours (syntax-terminal-themes.ts). */
export function useNativeChatTerminalSyntaxThemes(): void {
  const [light, dark] = useTerminalThemeNames()
  useEffect(() => {
    void applyTerminalSyntaxThemes({ light, dark })
  }, [light, dark])
}
