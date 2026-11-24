import { describe, expect, it } from 'vitest'
import { structuredHeldByBackgroundWork } from './structured-held-by-background-work'

const shell = { id: 's', kind: 'command', state: 'working' } as const
const agent = { id: 'a', kind: 'agent', state: 'working' } as const

describe('structuredHeldByBackgroundWork', () => {
  it('holds an ended turn while only shells run', () => {
    expect(structuredHeldByBackgroundWork({ isMonitoring: true, tasks: [shell] }, false)).toBe(true)
  })

  it('does not hold a running turn, an idle chat, or one whose subagents still work', () => {
    expect(structuredHeldByBackgroundWork({ isMonitoring: true, tasks: [shell] }, true)).toBe(false)
    expect(structuredHeldByBackgroundWork({ isMonitoring: false, tasks: [] }, false)).toBe(false)
    expect(
      structuredHeldByBackgroundWork({ isMonitoring: true, tasks: [shell, agent] }, false)
    ).toBe(false)
  })

  it('reads the host child records over the task rows', () => {
    const tasks = [agent]
    expect(structuredHeldByBackgroundWork({ isMonitoring: true, children: [], tasks }, false)).toBe(
      false
    )
  })
})
