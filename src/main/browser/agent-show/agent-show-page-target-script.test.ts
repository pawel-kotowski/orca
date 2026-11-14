import { afterEach, describe, expect, it } from 'vitest'
import { findAgentShowTarget } from './agent-show-page-target-script'

const aborts: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(aborts.splice(0).map((abort) => abort()))
})

// happy-dom has no layout: an element is "visible" here when the test gives it a box.
async function page(html: string, visibleIds: string[]): Promise<Document> {
  const { Window } = await import('happy-dom')
  const window = new Window()
  aborts.push(() => window.happyDOM.abort())
  const document = window.document as unknown as Document
  document.body.innerHTML = html
  for (const element of Array.from(document.querySelectorAll('*'))) {
    const visible = visibleIds.includes(element.id)
    element.getClientRects = () =>
      (visible ? [{ width: 10, height: 10 }] : []) as unknown as DOMRectList
  }
  return document
}

describe('findAgentShowTarget', () => {
  it('takes the first visible selector match and counts every match', async () => {
    const doc = await page(
      '<button id="a" class="save">Save</button><button id="b" class="save">Save</button><button id="c" class="save">Save</button>',
      ['b', 'c']
    )
    const found = findAgentShowTarget(doc, { selector: '.save' })
    expect(found.element?.id).toBe('b')
    expect([found.matches, found.visibleMatches]).toEqual([3, 2])
  })

  it('falls back to the first match when none is visible', async () => {
    const doc = await page('<p id="a" class="x"></p><p id="b" class="x"></p>', [])
    expect(findAgentShowTarget(doc, { selector: '.x' }).element?.id).toBe('a')
  })

  it('marks the innermost element holding the text, ignoring case and spacing', async () => {
    const doc = await page(
      '<main id="m"><section id="s"><button id="btn">Place   <b id="b">Order</b></button></section></main>',
      ['m', 's', 'btn', 'b']
    )
    const found = findAgentShowTarget(doc, { text: 'place order' })
    expect(found.element?.id).toBe('btn')
    expect(found.matches).toBe(1)
  })

  it('reports an invalid selector and no match without throwing', async () => {
    const doc = await page('<p id="a">hi</p>', ['a'])
    expect(findAgentShowTarget(doc, { selector: 'p[' })).toEqual({
      element: null,
      matches: 0,
      visibleMatches: 0,
      error: 'invalid CSS selector'
    })
    expect(findAgentShowTarget(doc, { text: 'missing' })).toEqual({
      element: null,
      matches: 0,
      visibleMatches: 0
    })
  })
})
