// Local (glass build): authors of the Git Graph each in their own colour (Paweł, 2026-11-17:
// "make authors in different colors"). Hues are handed out in the order authors first appear in
// the loaded history, from twelve picked to sit far apart in turn, so the people of one repo get
// clearly different colours (hashing a name put two of four authors on 180° and 195°). One person
// keeps one hue across the graph: authors are one person when their email or their name matches
// (gitGraphPeople), since people commit under two spellings of a name and under two addresses
// ("Paweł Kotowski" at work and at Gmail, "maciejmajek" and "Maciej Majek"). main.css turns the
// hue into a colour that reads in light and dark themes.
import React, { createContext, useContext } from 'react'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

const HUES = [210, 30, 140, 330, 85, 265, 175, 0, 110, 295, 55, 235]

/** A name compared without accents, case, spaces or punctuation: "Paweł K." = "pawelk". */
export function gitGraphNameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Who is who among authors. Each email belongs to the name it is used with most, and emails whose
 * main names match are one person: "Paweł Kotowski" at work and at Gmail, "maciejmajek" and
 * "Maciej Majek" at two addresses. A name seen once on another person's email (GitHub writes the
 * pull request author's name on the merger's address) does not join the two: linking on any shared
 * name or email once folded Bartek into Maciej through one such commit (2026-11-17). An author with
 * no email is known by name. Returns a person id per author, '' when it has neither.
 */
export function gitGraphPeople(
  authors: Iterable<{ author?: string; authorEmail?: string }>
): (author: string | undefined, email: string | undefined) => string {
  const namesByEmail = new Map<string, Map<string, number>>()
  for (const { author, authorEmail } of authors) {
    const mail = (authorEmail ?? '').trim().toLowerCase()
    const name = author ? gitGraphNameKey(author) : ''
    if (!mail || !name) {
      continue
    }
    const names = namesByEmail.get(mail) ?? new Map<string, number>()
    names.set(name, (names.get(name) ?? 0) + 1)
    namesByEmail.set(mail, names)
  }
  const personByEmail = new Map<string, string>()
  for (const [mail, names] of namesByEmail) {
    const main = [...names].sort((a, b) => b[1] - a[1])[0]![0]
    personByEmail.set(mail, `n:${main}`)
  }
  return (author, email) => {
    const mail = (email ?? '').trim().toLowerCase()
    if (mail) {
      return personByEmail.get(mail) ?? `e:${mail}`
    }
    const name = author ? gitGraphNameKey(author) : ''
    return name ? `n:${name}` : ''
  }
}

export function gitGraphAuthorHues(items: readonly GitHistoryItem[]): {
  hueOf: (author: string | undefined, email: string | undefined) => number | undefined
} {
  const personOf = gitGraphPeople(items)
  const byPerson = new Map<string, number>()
  for (const item of items) {
    const person = personOf(item.author, item.authorEmail)
    if (person && !byPerson.has(person)) {
      byPerson.set(person, HUES[byPerson.size % HUES.length]!)
    }
  }
  return { hueOf: (author, email) => byPerson.get(personOf(author, email)) }
}

const AuthorHues = createContext<ReturnType<typeof gitGraphAuthorHues>>({ hueOf: () => undefined })
export const GitGraphAuthorHuesProvider = AuthorHues.Provider

/** Props for the element that shows an author's name: `data-git-graph-author` plus its hue. */
export function useGitGraphAuthorProps(
  author: string | undefined,
  email?: string
): { 'data-git-graph-author'?: ''; style?: React.CSSProperties } {
  const hue = useContext(AuthorHues).hueOf(author, email)
  return hue === undefined
    ? {}
    : {
        'data-git-graph-author': '',
        style: { '--git-graph-author-hue': hue } as React.CSSProperties
      }
}
