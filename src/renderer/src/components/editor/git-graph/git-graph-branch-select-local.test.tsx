// @vitest-environment happy-dom
// Picking an author once crashed the Git Graph tab: the button's label read the author list before
// it was made (2026-11-17, "Cannot access 'b' before initialization"). This picks one and closes.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type {
  GitHistoryItemRef,
  GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'
import { GitGraphBranchSelect } from './git-graph-branch-select'

const ref = (
  name: string,
  author: string,
  category: GitHistoryItemRef['category'] = 'branches'
) => ({
  id: `refs/${category === 'branches' ? 'heads' : 'remotes'}/${name}`,
  name,
  category,
  revision: 'a'.repeat(40),
  author,
  authorEmail: `${author.split(' ')[0]!.toLowerCase()}@example.com`
})

it('picks branches by author, keeps pinned ones, and names the author on the button', async () => {
  const refs = [
    ref('main', 'Ann Lee'),
    ref('development', 'Bob Ray'),
    ref('feature/a', 'Ann Lee'),
    ref('feature/b', 'Bob Ray'),
    ref('origin/feature/c', 'Ann Lee', 'remote branches')
  ]
  let value = 'all' as GitHistoryRefs
  const onChange = vi.fn((next: GitHistoryRefs) => {
    value = next
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = () =>
    root.render(
      <GitGraphBranchSelect
        refs={refs}
        value={value}
        pinned={['main', 'development']}
        onChange={onChange}
      />
    )
  await act(async () => render())
  const button = () => container.querySelector('button')!
  await act(async () => button().click())
  const chip = [...document.body.querySelectorAll('button')].find((b) =>
    b.textContent?.startsWith('Ann Lee')
  )!
  expect(chip).toBeTruthy()
  await act(async () => chip.click())
  await act(async () => button().click()) // closes: the pick applies
  await act(async () => render())
  expect(onChange).toHaveBeenCalled()
  expect([...(value as string[])].sort()).toEqual([
    'refs/heads/development',
    'refs/heads/feature/a',
    'refs/heads/main',
    'refs/remotes/origin/feature/c'
  ])
  expect(button().textContent).toContain('Branches by Ann Lee')
  root.unmount()
})
