import { describe, expect, it } from 'vitest'
import {
  isEmptyShow,
  parseShows,
  restorableShows,
  serializeShows,
  type OwnerShowSnapshot
} from './agent-show-snapshot'

const owner = (worktreeId: string, ownerTabId: string): OwnerShowSnapshot => ({
  worktreeId,
  worktreePath: '/w',
  ownerTabId,
  code: [
    ['/w/a.ts', [{ mark: '1', startLine: 3, endLine: 9, note: 'entry', seq: 4, tabId: 't1' }]]
  ],
  stage: {
    openedTabs: [['t1', '/w/a.ts']],
    createdGroups: ['g1'],
    usedGroups: ['g1'],
    foldedSidebars: ['right']
  },
  tree: null,
  ui: [
    {
      pageId: 'p1',
      request: { kind: 'ui', target: { selector: '#count' }, mark: '1', note: 'the count' }
    }
  ]
})

describe('agent show snapshots', () => {
  it('round-trips what an owner showed', () => {
    const stored = [owner('w1', 'chat')]
    expect(parseShows(serializeShows(stored))).toEqual(stored)
  })

  it('reads nothing from missing, damaged or other-version storage', () => {
    expect(parseShows(null)).toEqual([])
    expect(parseShows('{not json')).toEqual([])
    expect(parseShows(JSON.stringify({ version: 2, owners: [owner('w1', 'chat')] }))).toEqual([])
  })

  it('restores only owners whose tab is still open in their worktree', () => {
    const tabs = { w1: [{ id: 'other', entityId: 'structured-agent-session-chat' }] }
    const kept = restorableShows(
      [owner('w1', 'structured-agent-session-chat'), owner('w1', 'gone'), owner('w2', 'chat')],
      tabs
    )
    expect(kept.map((o) => `${o.worktreeId}/${o.ownerTabId}`)).toEqual([
      'w1/structured-agent-session-chat'
    ])
  })

  it('treats an owner with no marks left as nothing to keep', () => {
    expect(isEmptyShow({ ...owner('w1', 'chat'), code: [], ui: [] })).toBe(true)
    expect(isEmptyShow(owner('w1', 'chat'))).toBe(false)
  })
})
