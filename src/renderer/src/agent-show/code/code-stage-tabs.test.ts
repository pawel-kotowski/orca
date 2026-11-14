import { describe, expect, it } from 'vitest'
import { stageTabsToClose } from './code-stage-tabs'

describe('stageTabsToClose', () => {
  const opened = new Map([
    ['t1', '/w/a.ts'],
    ['t2', '/w/b.ts'],
    ['t3', '/w/c.ts']
  ])

  it('closes opened tabs whose file lost its marks, never the one just shown', () => {
    expect(stageTabsToClose(opened, new Set(['/w/c.ts']), 't3')).toEqual(['t1', 't2'])
    expect(stageTabsToClose(opened, new Set(['/w/a.ts', '/w/c.ts']), 't3')).toEqual(['t2'])
  })

  it('closes every opened tab on clear', () => {
    expect(stageTabsToClose(opened, new Set(), null)).toEqual(['t1', 't2', 't3'])
  })
})
