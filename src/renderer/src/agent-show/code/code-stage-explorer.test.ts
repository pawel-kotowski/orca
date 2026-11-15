import { describe, expect, it } from 'vitest'
import { stageFoldsRightSidebar } from './code-stage-explorer'

describe('stageFoldsRightSidebar', () => {
  it('folds the open explorer when no folders are lit', () => {
    expect(stageFoldsRightSidebar({ open: true, tab: 'explorer', foldersLit: false })).toBe(true)
  })

  it('keeps it while folders are lit', () => {
    expect(stageFoldsRightSidebar({ open: true, tab: 'explorer', foldersLit: true })).toBe(false)
  })

  it('keeps the Tours panel the user clicked a step in', () => {
    expect(stageFoldsRightSidebar({ open: true, tab: 'tours', foldersLit: false })).toBe(false)
  })

  it('does nothing when the sidebar is already closed', () => {
    expect(stageFoldsRightSidebar({ open: false, tab: 'explorer', foldersLit: false })).toBe(false)
  })
})
