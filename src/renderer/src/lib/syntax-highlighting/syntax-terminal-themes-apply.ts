import { glassDiagnostic } from '@/lib/glass-diagnostic'
import { loadSyntaxHighlighterCore } from './syntax-highlighter'
import { setSelectedSyntaxThemes, shikiThemeForTerminalTheme } from './syntax-terminal-themes'

type LoadTheme = Awaited<ReturnType<typeof loadSyntaxHighlighterCore>>['core']['loadTheme']

/**
 * Local build: colour the chat's code in the terminal theme's syntax colours where shiki ships
 * them (null or an unknown name keeps Light+/Dark+). Loads the theme before switching, so no block
 * tokenizes against a theme the highlighter does not have.
 */
export async function applyTerminalSyntaxThemes(names: {
  light: string | null
  dark: string | null
}): Promise<void> {
  const light = shikiThemeForTerminalTheme(names.light)
  const dark = shikiThemeForTerminalTheme(names.dark)
  glassDiagnostic('syntax-theme-apply', { names, light: light?.id ?? null, dark: dark?.id ?? null })
  try {
    if (light || dark) {
      const highlighter = await loadSyntaxHighlighterCore()
      const loaded = await Promise.all(
        [light, dark].flatMap((theme) => (theme ? [theme.load()] : []))
      )
      await highlighter.core.loadTheme(
        ...loaded.map((module) => (module as { default: Parameters<LoadTheme>[0] }).default)
      )
    }
    setSelectedSyntaxThemes({ light: light?.id ?? 'light-plus', dark: dark?.id ?? 'dark-plus' })
    glassDiagnostic('syntax-theme-selected', { light: light?.id ?? null, dark: dark?.id ?? null })
  } catch (error) {
    // A theme that fails to load leaves the code in Light+/Dark+.
    glassDiagnostic('syntax-theme-failed', { names, error: String(error) })
    setSelectedSyntaxThemes({ light: 'light-plus', dark: 'dark-plus' })
  }
}
