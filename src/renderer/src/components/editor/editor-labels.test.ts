import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { getSameNameFolderHint } from './editor-labels'

function open(relativePath: string, extra: Partial<OpenFile> = {}): OpenFile {
  return {
    id: `/repo/${relativePath}`,
    filePath: `/repo/${relativePath}`,
    relativePath,
    worktreeId: 'wt',
    mode: 'edit',
    ...extra
  } as OpenFile
}

describe('getSameNameFolderHint', () => {
  it('names the parent folder when another open file shares the name', () => {
    const files = [open('mobile/README.md'), open('cloud/README.md'), open('src/index.ts')]
    expect(getSameNameFolderHint(files[0]!, files)).toBe('mobile')
    expect(getSameNameFolderHint(files[1]!, files)).toBe('cloud')
    expect(getSameNameFolderHint(files[2]!, files)).toBeNull()
  })

  it('uses the whole folder when the nearest folders match too', () => {
    const files = [open('a/src/index.ts'), open('b/src/index.ts')]
    expect(getSameNameFolderHint(files[0]!, files)).toBe('a/src')
  })

  it('ignores other worktrees, the same file in a split, and a file at the root', () => {
    const files = [
      open('README.md'),
      open('mobile/README.md'),
      open('mobile/README.md', { id: 'split' }),
      open('cloud/README.md', { worktreeId: 'other' })
    ]
    expect(getSameNameFolderHint(files[0]!, files)).toBeNull()
    expect(getSameNameFolderHint(files[1]!, files)).toBe('mobile')
  })
})
