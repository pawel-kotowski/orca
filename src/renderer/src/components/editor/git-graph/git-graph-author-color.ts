// Local (glass build): authors of the Git Graph each in their own colour (Paweł, 2026-11-17:
// "make authors in different colors"). Hues are handed out in the order authors first appear in
// the loaded history, from twelve picked to sit far apart in turn, so the people of one repo get
// clearly different colours (hashing a name put two of four authors on 180° and 195°). One person
// keeps one hue across the graph: keyed by email, since one person often commits under two
// spellings of a name. main.css turns the hue into a colour that reads in light and dark themes.
import React, { createContext, useContext } from 'react'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

const HUES = [210, 30, 140, 330, 85, 265, 175, 0, 110, 295, 55, 235]

function authorKey(author: string | undefined, email: string | undefined): string {
  return (email || author || '').trim().toLowerCase()
}

export function gitGraphAuthorHues(items: readonly GitHistoryItem[]): Map<string, number> {
  const hues = new Map<string, number>()
  for (const item of items) {
    const key = authorKey(item.author, item.authorEmail)
    if (key && !hues.has(key)) {
      hues.set(key, HUES[hues.size % HUES.length]!)
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
  const hue = useContext(AuthorHues).get(authorKey(author, email))
  return hue === undefined
    ? {}
    : {
        'data-git-graph-author': '',
        style: { '--git-graph-author-hue': hue } as React.CSSProperties
      }
}
