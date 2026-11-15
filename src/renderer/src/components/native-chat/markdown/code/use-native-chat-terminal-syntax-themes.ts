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

let following = false
let appliedKey: string | null = null

function applyFromSettings(settings: Parameters<typeof terminalSyntaxThemeNames>[0]): void {
  const names = terminalSyntaxThemeNames(settings)
  const key = `${names.light}\n${names.dark}`
  if (key === appliedKey) {
    return
  }
  appliedKey = key
  void applyTerminalSyntaxThemes(names)
}

/**
 * Local build: the chat's code takes the terminal theme's syntax colours (syntax-terminal-themes.ts).
 * Why the store is read here, not through a hook guarded at module load: the guard ran while this
 * lazily loaded chunk evaluated and left the code in Dark+ (2026-11-15); read on first use, the
 * store is always ready. Some tests stand a plain object in for the store; Light+/Dark+ hold there.
 */
export function useNativeChatTerminalSyntaxThemes(): void {
  useEffect(() => {
    if (following || typeof useAppStore?.subscribe !== 'function') {
      return
    }
    following = true
    applyFromSettings(useAppStore.getState().settings)
    useAppStore.subscribe((state) => applyFromSettings(state.settings))
  }, [])
}
