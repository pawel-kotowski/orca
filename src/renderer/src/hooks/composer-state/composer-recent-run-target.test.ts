import { describe, expect, it } from 'vitest'
import type { ProjectHostSetupOption } from '@/lib/workspace/creation/project-host-setup-options'
import { recentComposerRunTarget } from './composer-recent-run-target'

const option = (id: string, hostId: string, kind = 'ready'): ProjectHostSetupOption =>
  ({ id, hostId, kind }) as unknown as ProjectHostSetupOption

describe('recent run target', () => {
  const options = [
    option('local', 'local'),
    option('devbox', 'runtime:devbox'),
    option('robo', 'runtime:robo', 'needs-setup')
  ]

  it("prefers the project's own last pick", () => {
    const stored = {
      byProject: { mos: { id: 'devbox', hostId: 'runtime:devbox' } },
      lastHostId: 'local'
    }
    expect(recentComposerRunTarget('mos', options, stored)?.id).toBe('devbox')
  })

  it('falls back to the last machine overall, ready setups only', () => {
    expect(
      recentComposerRunTarget('other', options, { byProject: {}, lastHostId: 'runtime:devbox' })?.id
    ).toBe('devbox')
    expect(
      recentComposerRunTarget('other', options, { byProject: {}, lastHostId: 'runtime:robo' })
    ).toBeNull()
  })
})
