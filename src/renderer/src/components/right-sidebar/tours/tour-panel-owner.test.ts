import { describe, expect, it } from 'vitest'
import { pickTourOwnerTab } from './tour-panel-owner'

const tab = (
  id: string,
  contentType: 'terminal' | 'agent-session' | 'editor',
  lastFocusedAt: number,
  viewMode?: 'chat' | 'terminal'
) => ({ id, contentType, lastFocusedAt, createdAt: 0, viewMode })

describe('pickTourOwnerTab', () => {
  it('keeps the agent already playing a tour in this workspace', () => {
    const tabs = [tab('chat', 'agent-session', 9), tab('term', 'terminal', 1)]
    expect(pickTourOwnerTab(tabs, ['term'])).toBe('term')
  })

  it('takes the most recent agent chat over a more recent plain terminal', () => {
    const tabs = [
      tab('old-chat', 'agent-session', 1),
      tab('new-chat', 'terminal', 5, 'chat'),
      tab('shell', 'terminal', 9),
      tab('file', 'editor', 10)
    ]
    expect(pickTourOwnerTab(tabs, [])).toBe('new-chat')
  })

  it('falls back to the most recent terminal, and to none without one', () => {
    expect(pickTourOwnerTab([tab('a', 'terminal', 1), tab('b', 'terminal', 3)], [])).toBe('b')
    expect(pickTourOwnerTab([tab('file', 'editor', 1)], [])).toBeNull()
  })
})
