import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { writeNativeChatAppearance } from '../native-chat/appearance/native-chat-appearance-write'

/**
 * How Paweł left the views (section sizes, which sections are open or folded, which view the
 * sidebar shows), saved in settings (`nativeChatAppearance.viewLayout`), so it lives in the profile
 * database with every other setting and survives restarts and new builds (Paweł, 2026-11-16: "all
 * my settings should be remembered also across restarts when orca build is updated"). It replaces
 * per-window localStorage, whose values are read once as a fallback and then moved here.
 */
const LAYOUT_KEY = 'viewLayout'

type ViewLayout = Readonly<Record<string, unknown>>
const EMPTY: ViewLayout = {}

function layoutOf(appearance: unknown): ViewLayout {
  const value =
    appearance && typeof appearance === 'object'
      ? (appearance as Record<string, unknown>)[LAYOUT_KEY]
      : undefined
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ViewLayout) : EMPTY
}

export function readViewLayout(key: string): unknown {
  return layoutOf(useAppStore.getState().settings?.nativeChatAppearance)[key]
}

/** Save one value; `undefined` forgets it. Writes are queued with every other appearance write. */
export function writeViewLayout(key: string, value: unknown): void {
  void writeNativeChatAppearance((current) => {
    const layout = { ...layoutOf(current) }
    if (value === undefined) {
      delete layout[key]
    } else {
      layout[key] = value
    }
    const rest = { ...current } as Record<string, unknown>
    delete rest[LAYOUT_KEY]
    return Object.keys(layout).length > 0 ? { ...rest, [LAYOUT_KEY]: layout } : rest
  })
}

export function readLegacyLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * One remembered value. `parse` turns the saved value into T (undefined when absent or invalid);
 * `legacy` reads an older localStorage value, used and moved into settings when nothing is saved.
 * `preview` changes the value on screen without saving (a drag in progress); `commit` saves it.
 */
export function useViewLayoutValue<T>(
  key: string,
  parse: (value: unknown) => T | undefined,
  fallback: T,
  legacy?: () => T | undefined
): { value: T; preview: (value: T) => void; commit: (value: T | undefined) => void } {
  // Why the raw value: a selector must return a stable reference; parsing happens after.
  const raw = useAppStore((state) => layoutOf(state.settings?.nativeChatAppearance)[key])
  const loaded = useAppStore((state) => state.settings !== null && state.settings !== undefined)
  const stored = useMemo(() => parse(raw), [parse, raw])
  const legacyRef = useRef<{ value: T | undefined } | null>(null)
  if (legacyRef.current === null) {
    legacyRef.current = { value: legacy?.() }
  }
  const legacyValue = legacyRef.current.value
  // Why local: a drag shows every step, and a saved value shows before settings echo it back.
  const [local, setLocal] = useState<{ value: T | undefined } | null>(null)
  useEffect(() => {
    if (loaded && stored === undefined && legacyValue !== undefined) {
      writeViewLayout(key, legacyValue)
    }
  }, [key, legacyValue, loaded, stored])
  const preview = useCallback((value: T) => setLocal({ value }), [])
  const commit = useCallback(
    (value: T | undefined) => {
      setLocal({ value })
      writeViewLayout(key, value)
    },
    [key]
  )
  const value = local ? local.value : (stored ?? legacyValue)
  return { value: value ?? fallback, preview, commit }
}

export function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function parseStringList(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? (value as string[])
    : undefined
}
