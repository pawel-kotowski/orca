import type * as ReactModule from 'react'
import type * as ReactI18nextModule from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type EffectCallback = () => void | (() => void)

type ReactElementLike = {
  type: unknown
  props: Record<string, unknown>
}

const hookRuntime = vi.hoisted(() => ({
  effects: [] as EffectCallback[],
  layoutEffects: [] as EffectCallback[],
  index: 0,
  values: [] as unknown[]
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactModule>('react')
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: EffectCallback) => {
      hookRuntime.effects.push(effect)
    },
    useLayoutEffect: (effect: EffectCallback) => {
      hookRuntime.layoutEffects.push(effect)
    },
    useRef: <T,>(initialValue: T) => {
      const index = hookRuntime.index
      hookRuntime.index += 1
      if (hookRuntime.values[index] === undefined) {
        hookRuntime.values[index] = { current: initialValue }
      }
      return hookRuntime.values[index] as { current: T }
    },
    useState: <T,>(initialValue: T | (() => T)) => {
      const index = hookRuntime.index
      hookRuntime.index += 1
      if (hookRuntime.values[index] === undefined) {
        hookRuntime.values[index] =
          typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
      }
      const setValue = (nextValue: T | ((current: T) => T)): void => {
        hookRuntime.values[index] =
          typeof nextValue === 'function'
            ? (nextValue as (current: T) => T)(hookRuntime.values[index] as T)
            : nextValue
      }
      return [hookRuntime.values[index] as T, setValue] as const
    }
  }
})

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18nextModule>()),
  useTranslation: () => ({})
}))

vi.mock('lucide-react', () => ({
  PanelsTopLeft: function PanelsTopLeft() {
    return null
  }
}))

vi.mock('@/components/ui/button', () => ({
  Button: function Button() {
    return null
  }
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: function Tooltip(props: { children?: unknown }) {
    return props.children
  },
  TooltipContent: function TooltipContent(props: { children?: unknown }) {
    return props.children
  },
  TooltipTrigger: function TooltipTrigger(props: { children?: unknown }) {
    return props.children
  }
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => 'Cmd+`'
}))

vi.mock('./FloatingTerminalIconContextMenu', () => ({
  FloatingTerminalIconContextMenu: function FloatingTerminalIconContextMenu(props: {
    children?: unknown
  }) {
    return props.children
  }
}))

const storeState = vi.hoisted(() => ({ hasFloatingUnread: false, statusBarVisible: true }))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: typeof storeState) => T): T => selector(storeState)
}))

vi.mock('@/store/workspaces/floating/floating-workspace-unread-selector', () => ({
  selectFloatingWorkspaceHasUnread: (state: typeof storeState): boolean => state.hasFloatingUnread
}))

vi.mock('@/i18n/use-translate', () => ({
  useTranslate: () => (_key: string, fallback: string) => fallback
}))

function visit(node: unknown, cb: (node: ReactElementLike) => void): void {
  if (node == null || typeof node === 'string' || typeof node === 'number') {
    return
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => visit(entry, cb))
    return
  }
  const element = node as ReactElementLike
  if (!element.props) {
    return
  }
  cb(element)
  visit(element.props.children, cb)
}

function findByProp(node: unknown, propName: string): ReactElementLike {
  let found: ReactElementLike | null = null
  visit(node, (entry) => {
    if (entry.props[propName]) {
      found = entry
    }
  })
  if (!found) {
    throw new Error(`${propName} not found`)
  }
  return found
}

async function renderToggle(open = false, onToggle = vi.fn()): Promise<unknown> {
  hookRuntime.index = 0
  const { FloatingTerminalToggleButton } = await import('./FloatingTerminalToggleButton')
  return FloatingTerminalToggleButton({ open, onToggle })
}

function getToggleStyle(element: unknown): Record<string, number> {
  const container = findByProp(element, 'currentLocation')
  return container.props.style as Record<string, number>
}

function getToggleButton(element: unknown): ReactElementLike {
  return findByProp(element, 'data-floating-terminal-toggle')
}

// Local build: the launcher is parked in the bottom-right corner and never drags.
describe('FloatingTerminalToggleButton placement (local build)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookRuntime.effects = []
    hookRuntime.layoutEffects = []
    hookRuntime.index = 0
    hookRuntime.values = []
    storeState.statusBarVisible = true
  })

  it('sits in the bottom-right corner, the same small gap from the edge and the status bar', async () => {
    const element = await renderToggle()
    expect(getToggleStyle(element)).toEqual({ right: 6, bottom: 30 })
  })

  it('keeps the same gap from the window bottom when the status bar is hidden', async () => {
    storeState.statusBarVisible = false
    const element = await renderToggle()
    expect(getToggleStyle(element)).toEqual({ right: 6, bottom: 6 })
  })

  it('toggles on click and cannot be dragged', async () => {
    const onToggle = vi.fn()
    const element = await renderToggle(false, onToggle)
    const button = getToggleButton(element)
    expect(button.props.onPointerDown).toBeUndefined()
    ;(button.props.onClick as () => void)()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
