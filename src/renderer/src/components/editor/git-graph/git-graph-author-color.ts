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

function personKeys(author: string | undefined, email: string | undefined): string[] {
  const keys: string[] = []
  const mail = (email ?? '').trim().toLowerCase()
  const name = author ? gitGraphNameKey(author) : ''
  if (mail) {
    keys.push(`e:${mail}`)
  }
  if (name) {
    keys.push(`n:${name}`)
  }
  return keys
}

/**
 * Who is who among authors: two authors are one person when they share an email or a name (as
 * gitGraphNameKey compares it). Returns a person id per author, '' when it has neither.
 */
export function gitGraphPeople(
  authors: Iterable<{ author?: string; authorEmail?: string }>
): (author: string | undefined, email: string | undefined) => string {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    return root
  }
  for (const { author, authorEmail } of authors) {
    const keys = personKeys(author, authorEmail)
    for (const key of keys) {
      if (!parent.has(key)) {
        parent.set(key, key)
      }
    }
    if (keys.length === 2) {
      const [a, b] = [find(keys[0]!), find(keys[1]!)]
      if (a !== b) {
        parent.set(b, a)
      }
    }
  }
  return (author, email) => {
    const key = personKeys(author, email).find((k) => parent.has(k))
    return key ? find(key) : ''
  }
}

export function gitGraphAuthorHues(items: readonly GitHistoryItem[]): Map<string, number> {
  const personOf = gitGraphPeople(items)
  const byPerson = new Map<string, number>()
  // Every key of a person (its emails, its names) maps to that person's hue.
  const hues = new Map<string, number>()
  for (const item of items) {
    const person = personOf(item.author, item.authorEmail)
    if (!person) {
      continue
    }
    if (!byPerson.has(person)) {
      byPerson.set(person, HUES[byPerson.size % HUES.length]!)
    }
    for (const key of personKeys(item.author, item.authorEmail)) {
      hues.set(key, byPerson.get(person)!)
    }
  }
  return hues
}

const AuthorHues = createContext<Map<string, number>>(new Map())
export const GitGraphAuthorHuesProvider = AuthorHues.Provider

/** Props for the element that shows an author's name: `data-git-graph-author` plus its hue. */
export function useGitGraphAuthorProps(
  author: string | undefined,
  email?: string
): { 'data-git-graph-author'?: ''; style?: React.CSSProperties } {
  const hues = useContext(AuthorHues)
  const hue = personKeys(author, email)
    .map((key) => hues.get(key))
    .find((value) => value !== undefined)
  return hue === undefined
    ? {}
    : {
        'data-git-graph-author': '',
        style: { '--git-graph-author-hue': hue } as React.CSSProperties
      }
}
