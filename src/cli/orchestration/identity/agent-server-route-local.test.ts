import { describe, expect, it } from 'vitest'
import { withOn } from './agent-server-route'

describe('the command suggested to an agent that pointed --environment at a server', () => {
  it('moves the server to --on and drops a --from the agent made up', () => {
    const suggested = withOn(
      [
        'orchestration',
        'send',
        '--environment',
        'box',
        '--to',
        'term_b',
        '--from',
        'projects-87',
        '--subject',
        'Hi'
      ],
      'box'
    )
    expect(suggested).toContain('--on box')
    expect(suggested).toContain('--to term_b')
    expect(suggested).not.toContain('--environment')
    expect(suggested).not.toContain('projects-87')
  })

  it('drops --from=<value> too', () => {
    const args = [
      'orchestration',
      'send',
      '--environment=box',
      '--from=projects-87',
      '--to',
      'term_b'
    ]
    expect(withOn(args, 'box')).not.toContain('projects-87')
  })
})
