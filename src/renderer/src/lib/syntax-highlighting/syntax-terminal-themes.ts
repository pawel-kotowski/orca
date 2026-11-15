/**
 * Local build (Paweł, 2026-11-15: "make code shown in chat ... gruvbox dark in dark mode ... when i
 * have current theme enabled"): the chat's syntax colours follow the terminal theme wherever shiki
 * ships the same theme, while Settings → Chat → "Colour from the terminal theme" is on. Any other
 * terminal theme keeps VS Code Light+/Dark+.
 */
export const DEFAULT_SYNTAX_THEMES = { light: 'light-plus', dark: 'dark-plus' } as const

// Explicit imports so Vite bundles exactly these themes.
const SHIKI_THEMES: Record<string, { id: string; load: () => Promise<unknown> }> = {
  'Gruvbox Dark': {
    id: 'gruvbox-dark-medium',
    load: () => import('shiki/themes/gruvbox-dark-medium.mjs')
  },
  'Gruvbox Light': {
    id: 'gruvbox-light-medium',
    load: () => import('shiki/themes/gruvbox-light-medium.mjs')
  },
  'One Dark': { id: 'one-dark-pro', load: () => import('shiki/themes/one-dark-pro.mjs') },
  'One Light': { id: 'one-light', load: () => import('shiki/themes/one-light.mjs') },
  'Tokyo Night': { id: 'tokyo-night', load: () => import('shiki/themes/tokyo-night.mjs') },
  'Catppuccin Mocha': {
    id: 'catppuccin-mocha',
    load: () => import('shiki/themes/catppuccin-mocha.mjs')
  },
  'Catppuccin Latte': {
    id: 'catppuccin-latte',
    load: () => import('shiki/themes/catppuccin-latte.mjs')
  },
  'Solarized Dark': { id: 'solarized-dark', load: () => import('shiki/themes/solarized-dark.mjs') },
  'Solarized Light': {
    id: 'solarized-light',
    load: () => import('shiki/themes/solarized-light.mjs')
  },
  'GitHub Light': { id: 'github-light', load: () => import('shiki/themes/github-light.mjs') },
  'Rose Pine': { id: 'rose-pine', load: () => import('shiki/themes/rose-pine.mjs') },
  'Rose Pine Dawn': { id: 'rose-pine-dawn', load: () => import('shiki/themes/rose-pine-dawn.mjs') },
  'Everforest Dark': {
    id: 'everforest-dark',
    load: () => import('shiki/themes/everforest-dark.mjs')
  },
  'Everforest Light': {
    id: 'everforest-light',
    load: () => import('shiki/themes/everforest-light.mjs')
  },
  'Ayu Dark': { id: 'ayu-dark', load: () => import('shiki/themes/ayu-dark.mjs') },
  'Night Owl': { id: 'night-owl', load: () => import('shiki/themes/night-owl.mjs') }
}

// Why a key, not the name: a plugin theme is stored by id (`plugin:stablyai.orca-gruvbox-theme/
// gruvbox-dark`), a built-in one by name (`Gruvbox Dark`); both reduce to `gruvboxdark`
// (2026-11-15: matching names only left Paweł's Gruvbox plugin theme in Dark+).
function themeKey(name: string): string {
  const slug = name.startsWith('plugin:') ? name.slice(name.lastIndexOf('/') + 1) : name
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const SHIKI_THEMES_BY_KEY = new Map(
  Object.entries(SHIKI_THEMES).map(([name, theme]) => [themeKey(name), theme])
)

export function shikiThemeForTerminalTheme(
  name: string | null | undefined
): { id: string; load: () => Promise<unknown> } | null {
  return (name && SHIKI_THEMES_BY_KEY.get(themeKey(name))) || null
}

export type SyntaxThemeIds = { light: string; dark: string }

let selected: SyntaxThemeIds = { ...DEFAULT_SYNTAX_THEMES }
let generation = 0
const listeners = new Set<() => void>()

export function selectedSyntaxThemes(): SyntaxThemeIds {
  return selected
}

/** Bumps on every change, so finished blocks re-colour instead of keeping the old theme's tokens. */
export function syntaxThemeGeneration(): number {
  return generation
}

export function subscribeSyntaxThemes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSelectedSyntaxThemes(next: SyntaxThemeIds): void {
  if (next.light === selected.light && next.dark === selected.dark) {
    return
  }
  selected = next
  generation += 1
  for (const listener of listeners) {
    listener()
  }
}
