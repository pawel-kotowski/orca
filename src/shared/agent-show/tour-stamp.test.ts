import { describe, expect, it } from 'vitest'
import { readTourStamp, writeTourStamp } from './tour-stamp'

const TOUR = '# How files open\n\n## The CLI\nIt sends a call.\n'
const SHA = '8c209314c9aa1b2c3d4e5f60718293a4b5c6d7e8'

describe('tour stamp', () => {
  it('puts the stamp right under the title', () => {
    expect(writeTourStamp(TOUR, SHA)).toBe(
      `# How files open\n<!-- tour-commit: ${SHA} -->\n\n## The CLI\nIt sends a call.\n`
    )
  })

  it('replaces an earlier stamp instead of adding a second', () => {
    const once = writeTourStamp(TOUR, 'abcdef1')
    expect(writeTourStamp(once, SHA)).toBe(writeTourStamp(TOUR, SHA))
  })

  it('reads the stamp back, and null from a tour without one', () => {
    expect(readTourStamp(writeTourStamp(TOUR, SHA.toUpperCase()))).toBe(SHA)
    expect(readTourStamp(TOUR)).toBeNull()
  })

  it('keeps CRLF line endings', () => {
    expect(writeTourStamp('# T\r\n\r\n## S\r\n', 'abcdef1')).toBe(
      '# T\r\n<!-- tour-commit: abcdef1 -->\r\n\r\n## S\r\n'
    )
  })

  it('refuses something that is not a commit id', () => {
    expect(() => writeTourStamp(TOUR, 'main')).toThrow('not a commit id')
  })
})
