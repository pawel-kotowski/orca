import { describe, expect, it } from 'vitest'
import { toWebTerminalSurfaceTabId } from '../../../shared/workspace-layout/terminal-surface-id'
import { isShowOwnerTab } from './agent-show-owner-tab'

describe('isShowOwnerTab', () => {
  it("matches a local tab by id or entity id, and a box tab by this window's mirror", () => {
    expect(isShowOwnerTab({ id: 'tab-1' }, 'tab-1')).toBe(true)
    expect(isShowOwnerTab({ id: 'x', entityId: 'session-1' }, 'session-1')).toBe(true)
    expect(isShowOwnerTab({ id: toWebTerminalSurfaceTabId('box-tab') }, 'box-tab')).toBe(true)
    expect(isShowOwnerTab({ id: toWebTerminalSurfaceTabId('box-tab::leaf-2') }, 'box-tab')).toBe(
      true
    )
  })

  it('matches nothing else', () => {
    expect(isShowOwnerTab({ id: toWebTerminalSurfaceTabId('box-tab-10') }, 'box-tab')).toBe(false)
    expect(isShowOwnerTab({ id: 'tab-1' }, null)).toBe(false)
    expect(isShowOwnerTab({ id: 'web-terminal-%E0%A4%A' }, 'box-tab')).toBe(false)
  })
})
