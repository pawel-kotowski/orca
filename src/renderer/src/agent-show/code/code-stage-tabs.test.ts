import { describe, expect, it } from 'vitest'
import { stageTabsToClose } from './code-stage-tabs'

describe('stageTabsToClose', () => {
  const opened = new Map([
    ['t1', '/w/a.ts'],
    ['t2', '/w/b.ts'],
    ['t3', '/w/c.ts']
  ])

  it('closes opened tabs none of the marks belong to, never the one just shown', () => {
    expect(stageTabsToClose(opened, [{ filePath: '/w/c.ts', tabId: 't3' }], 't3')).toEqual([
      't1',
      't2'
    ])
    expect(stageTabsToClose(opened, [{ filePath: '/w/a.ts' }], 't3')).toEqual(['t2'])
  })

  it('closes a second pane of the same file once its own mark is gone', () => {
    const twice = new Map([
      ['top', '/w/a.ts'],
      ['bottom', '/w/a.ts']
    ])
    expect(stageTabsToClose(twice, [{ filePath: '/w/a.ts', tabId: 'bottom' }], 'bottom')).toEqual([
      'top'
    ])
  })

  it('closes every opened tab on clear', () => {
    expect(stageTabsToClose(opened, [], null)).toEqual(['t1', 't2', 't3'])
  })
})
