// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useGitGraphAutoPage } from './use-git-graph-auto-page'

function list(scrollHeight: number, clientHeight: number) {
  return {
    current: Object.defineProperties(document.createElement('div'), {
      scrollHeight: { value: scrollHeight },
      clientHeight: { value: clientHeight }
    })
  }
}

function setup(listRef: { current: HTMLDivElement }, over: Record<string, unknown> = {}) {
  const loadMore = vi.fn()
  const base = {
    listRef,
    rowCount: 5,
    items: [1] as unknown[],
    hasMore: true,
    loading: false,
    error: null,
    loadMore,
    ...over
  }
  const hook = renderHook((props: typeof base) => useGitGraphAutoPage(props), {
    initialProps: base
  })
  return { loadMore, rerender: (next: Partial<typeof base>) => hook.rerender({ ...base, ...next }) }
}

it('keeps paging without a scroll while the rows do not fill the list', () => {
  const { loadMore, rerender } = setup(list(300, 800))
  expect(loadMore).toHaveBeenCalledTimes(1)
  rerender({ loading: true })
  rerender({ items: [1, 2], rowCount: 5 })
  expect(loadMore).toHaveBeenCalledTimes(2)
})

it('asks again when a reload of the same length overtook the page', () => {
  const { loadMore, rerender } = setup(list(300, 800))
  rerender({ loading: true })
  rerender({ items: [1] })
  expect(loadMore).toHaveBeenCalledTimes(2)
})

it('asks once per loaded list', () => {
  const { loadMore, rerender } = setup(list(300, 800))
  rerender({ loading: true })
  rerender({ loading: false })
  expect(loadMore).toHaveBeenCalledTimes(1)
})

it('rests when far from the end, hidden, failed or complete', () => {
  expect(setup(list(9000, 800)).loadMore).not.toHaveBeenCalled()
  expect(setup(list(0, 0)).loadMore).not.toHaveBeenCalled()
  expect(setup(list(300, 800), { error: 'x' }).loadMore).not.toHaveBeenCalled()
  expect(setup(list(300, 800), { hasMore: false }).loadMore).not.toHaveBeenCalled()
})
