import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { moveClaudeChatAccount, type ClaudeChatAccountMoveDeps } from './claude-chat-account-move'

let root: string
let system: string
let saved: [string, string][]
let owed: boolean

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'chat-account-move-'))
  system = join(root, '.claude')
  mkdirSync(join(system, 'projects'), { recursive: true })
  for (const id of ['a', 'b']) {
    mkdirSync(join(root, id))
    symlinkSync(join(system, 'projects'), join(root, id, 'projects'), 'junction')
  }
  mkdirSync(join(root, 'apart', 'projects'), { recursive: true })
  saved = []
  owed = false
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function deps(selected: string): ClaudeChatAccountMoveDeps {
  return {
    router: {
      accountForLaunch: () => saved.at(-1)?.[1] ?? selected,
      selectedProfile: (id?: string | null) => (id ? { accountId: id } : null),
      accountLogin: (id: string) => (id === 'signed-out' ? null : { email: `${id}@x.test` }),
      coveredBySystemDefault: (id: string) => id === 'covered',
      systemDefaultHome: () => system,
      prepareAccount: async (id: string) => join(root, id)
    } as unknown as ClaudeChatAccountMoveDeps['router'],
    hasAccount: (id) => id !== 'gone',
    saveWorkspaceAccount: async (workspaceId, id) => {
      saved.push([workspaceId, id])
    },
    owesWork: async () => owed
  }
}

const move = (accountId: string, running: string | null, selected = 'a') =>
  moveClaudeChatAccount(
    {
      accountId,
      workspaceId: 'ws',
      runningHome: running && join(root, running),
      conversationHome: join(root, 'a')
    },
    deps(selected)
  )

it('moves the workspace, and the chat with its next message or after its work', async () => {
  expect(await move('b', 'a')).toEqual({ outcome: 'next_message' })
  expect(saved).toEqual([['ws', 'b']])
  saved = []
  owed = true
  expect(await move('b', 'a')).toEqual({ outcome: 'after_work' })
  saved = []
  expect(await move('b', null)).toEqual({ outcome: 'next_message' })
})

it('calls a waiting move off by picking the account the chat still runs on', async () => {
  expect(await move('a', 'a', 'b')).toEqual({ outcome: 'unchanged' })
  expect(saved).toEqual([['ws', 'a']])
})

it('moves to an account the system login covers, in the system folder', async () => {
  expect(await move('covered', 'a')).toEqual({ outcome: 'next_message' })
})

it('saves nothing for an account that could not resume the conversation', async () => {
  expect(await move('apart', 'a')).toEqual({ outcome: 'refused', reason: 'not_shared' })
  expect(await move('gone', 'a')).toEqual({ outcome: 'refused', reason: 'unknown_account' })
  expect(await move('signed-out', 'a')).toEqual({ outcome: 'refused', reason: 'unknown_account' })
  expect(saved).toEqual([])
})
