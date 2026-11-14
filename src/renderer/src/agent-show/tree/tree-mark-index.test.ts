import { describe, expect, it } from 'vitest'
import {
  buildTreeMarkIndex,
  resolveTreeEntryPath,
  rowTreeMark,
  treeEntryAncestors
} from './tree-mark-index'

const ROOT = '/w/app'

describe('resolveTreeEntryPath', () => {
  it('joins relative paths, keeps absolute ones inside the root, rejects the rest', () => {
    expect(resolveTreeEntryPath(ROOT, 'src/a.ts')).toBe('/w/app/src/a.ts')
    expect(resolveTreeEntryPath(ROOT, '/w/app/src/a.ts')).toBe('/w/app/src/a.ts')
    expect(resolveTreeEntryPath(ROOT, '../other/a.ts')).toBeNull()
    expect(resolveTreeEntryPath(ROOT, '/etc/passwd')).toBeNull()
    expect(resolveTreeEntryPath(ROOT, '.')).toBeNull()
  })
})

describe('treeEntryAncestors', () => {
  it('lists folders outermost first, without the root', () => {
    expect(treeEntryAncestors(ROOT, '/w/app/src/ui/a.ts')).toEqual(['/w/app/src', '/w/app/src/ui'])
    expect(treeEntryAncestors(ROOT, '/w/app/a.ts')).toEqual([])
  })
})

describe('rowTreeMark', () => {
  const index = buildTreeMarkIndex([
    {
      worktreePath: ROOT,
      dimOthers: true,
      entries: [
        { path: '/w/app/src/a.ts', label: 'entry point', isDirectory: false },
        { path: '/w/app/docs', isDirectory: true }
      ]
    }
  ])

  it('marks entries and carries the label', () => {
    expect(rowTreeMark(index, '/w/app/src/a.ts')).toEqual({
      marked: true,
      label: 'entry point',
      dimmed: false
    })
  })

  it('keeps ancestors and the insides of a marked folder, dims the rest', () => {
    expect(rowTreeMark(index, '/w/app/src').dimmed).toBe(false)
    expect(rowTreeMark(index, '/w/app/docs/guide/x.md').dimmed).toBe(false)
    expect(rowTreeMark(index, '/w/app/src/b.ts').dimmed).toBe(true)
    expect(rowTreeMark(index, '/w/app/package.json').dimmed).toBe(true)
  })

  it('leaves other worktrees alone', () => {
    expect(rowTreeMark(index, '/w/other/src/b.ts')).toEqual({ marked: false, dimmed: false })
  })

  it('does not dim when dimOthers is off', () => {
    const plain = buildTreeMarkIndex([
      {
        worktreePath: ROOT,
        dimOthers: false,
        entries: [{ path: '/w/app/src/a.ts', isDirectory: false }]
      }
    ])
    expect(rowTreeMark(plain, '/w/app/src/b.ts').dimmed).toBe(false)
  })
})
