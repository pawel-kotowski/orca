import { describe, expect, it } from 'vitest'
import { createNativeChatFileHref, routeNativeChatHref } from './native-chat-href-routing'

// Local (agent-show): chat links and visuals name code as `path:40-62`.
describe('routeNativeChatHref line ranges', () => {
  it('reads a line range as the path with its first and last line', () => {
    expect(routeNativeChatHref('src/app.ts:40-62')).toEqual({
      kind: 'file',
      pathText: 'src/app.ts',
      line: 40,
      endLine: 62
    })
    expect(routeNativeChatHref('README.md:5-20')).toEqual({
      kind: 'file',
      pathText: 'README.md',
      line: 5,
      endLine: 20
    })
    expect(routeNativeChatHref(createNativeChatFileHref('src/app.ts:40-62'))).toEqual({
      kind: 'file',
      pathText: 'src/app.ts',
      line: 40,
      endLine: 62
    })
    expect(routeNativeChatHref('src/app.ts#L40-L62')).toEqual({
      kind: 'file',
      pathText: 'src/app.ts',
      line: 40,
      endLine: 62
    })
  })

  it('reads a one-line or backwards range as a single line', () => {
    expect(routeNativeChatHref('src/app.ts:40-40')).toEqual({
      kind: 'file',
      pathText: 'src/app.ts',
      line: 40
    })
    expect(routeNativeChatHref('src/app.ts:62-40')).toEqual({
      kind: 'file',
      pathText: 'src/app.ts:62-40',
      line: null
    })
  })
})
