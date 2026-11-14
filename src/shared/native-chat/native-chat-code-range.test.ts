import { describe, expect, it } from 'vitest'
import { linkNativeChatFilePaths } from './native-chat-file-link-tree'
import { parseVisualCodeLocation } from './native-chat-code-range'
import { routeNativeChatHref } from './native-chat-href-routing'

describe('parseVisualCodeLocation', () => {
  it('reads a worktree-relative path with a range or one line', () => {
    expect(parseVisualCodeLocation('src/app.ts:40-62')).toEqual({
      pathText: 'src/app.ts',
      startLine: 40,
      endLine: 62
    })
    expect(parseVisualCodeLocation(' lib/a b.py:7 ')).toEqual({
      pathText: 'lib/a b.py',
      startLine: 7,
      endLine: 7
    })
  })

  it.each([
    ['an absolute path', '/etc/passwd:1-2'],
    ['a home path', '~/notes.md:1'],
    ['a parent segment', 'src/../../secret.ts:1-3'],
    ['a Windows drive', 'C:/repo/a.ts:1-2'],
    ['no line', 'src/app.ts'],
    ['line zero', 'src/app.ts:0-4'],
    ['a backwards range', 'src/app.ts:62-40'],
    ['a range over 5000 lines', 'src/app.ts:1-5001'],
    ['a control character', 'src/a\u0000.ts:1'],
    ['a number', 42]
  ])('refuses %s', (_name, value) => {
    expect(parseVisualCodeLocation(value)).toBeNull()
  })
})

type Node = { type: string; value?: string; url?: string; children?: Node[] }

function linkedRoutes(text: Node): unknown[] {
  const tree: Node = { type: 'root', children: [{ type: 'paragraph', children: [text] }] }
  linkNativeChatFilePaths(tree, () => true)
  return (tree.children?.[0]?.children ?? [])
    .filter((node) => node.type === 'link')
    .map((node) => ({
      text: node.children?.[0]?.value,
      route: routeNativeChatHref(node.url)
    }))
}

describe('chat path ranges', () => {
  it('links a prose range as a whole, sentence period excluded', () => {
    expect(linkedRoutes({ type: 'text', value: 'See src/app.ts:40-62.' })).toEqual([
      {
        text: 'src/app.ts:40-62',
        route: { kind: 'file', pathText: 'src/app.ts', line: 40, endLine: 62 }
      }
    ])
  })

  it('links an inline-code range', () => {
    expect(linkedRoutes({ type: 'inlineCode', value: 'src/app.ts:40-62' })).toEqual([
      {
        text: 'src/app.ts:40-62',
        route: { kind: 'file', pathText: 'src/app.ts', line: 40, endLine: 62 }
      }
    ])
  })
})
