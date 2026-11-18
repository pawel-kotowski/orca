import { describe, expect, it } from 'vitest'
import { composeWorktreeId } from '../../../../shared/worktree/id'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { applyActivitySectionKinds, isSlackAgentWorkspace } from './activity-slack-agents'
import type { ActivityThreadGroup, AgentPaneThread } from './threads/activity-thread-types'

const listener = composeWorktreeId('repo', '/home/u/orca/workspaces/aikros_engine/slack-agent')
const task = composeWorktreeId('repo', '/home/u/orca/workspaces/aikros_engine/fix-login')
const taskWorker = composeWorktreeId('repo', '/home/u/orca/workspaces/aikros_engine/fix-login-w1')
const plain = composeWorktreeId('repo', '/home/u/orca/workspaces/aikros_engine/my-feature')

function lineage(child: string, parent: string): WorktreeLineage {
  return {
    worktreeId: child,
    worktreeInstanceId: `${child}-i`,
    parentWorktreeId: parent,
    parentWorktreeInstanceId: `${parent}-i`,
    origin: 'cli',
    capture: { source: 'explicit-cli-flag', confidence: 'explicit' },
    createdAt: 0
  } as WorktreeLineage
}

const lineageById = {
  [task]: lineage(task, listener),
  [taskWorker]: lineage(taskWorker, task)
}

describe('isSlackAgentWorkspace', () => {
  it('finds a Slack task, its workers and the listener by the slack-agent ancestor', () => {
    expect(isSlackAgentWorkspace(listener, '', lineageById)).toBe(true)
    expect(isSlackAgentWorkspace(task, '', lineageById)).toBe(true)
    expect(isSlackAgentWorkspace(taskWorker, '', lineageById)).toBe(true)
    expect(isSlackAgentWorkspace(plain, '', lineageById)).toBe(false)
  })

  it('finds a Slack workspace by its comment when the lineage is not known', () => {
    expect(isSlackAgentWorkspace(plain, 'Slack task x (C1-1.2), started by slack-agent', {})).toBe(
      true
    )
    expect(isSlackAgentWorkspace(plain, 'proactive agent trading-agent, woke for x', {})).toBe(true)
    expect(isSlackAgentWorkspace(plain, 'my notes about slack', {})).toBe(false)
  })

  it('stops on a lineage loop', () => {
    const loop = { [plain]: lineage(plain, task), [task]: lineage(task, plain) }
    expect(isSlackAgentWorkspace(plain, '', loop)).toBe(false)
  })
})

describe('applyActivitySectionKinds', () => {
  const thread = (paneKey: string, slack: boolean): AgentPaneThread =>
    ({ paneKey, worktree: { id: slack ? task : plain } }) as AgentPaneThread
  const groups: ActivityThreadGroup[] = [
    { key: 'section:inbox', label: 'Inbox', threads: [thread('a', true), thread('b', false)] },
    { key: 'section:working', label: 'Working', threads: [thread('c', true)] }
  ]
  const isSlack = (t: AgentPaneThread): boolean => t.worktree.id === task

  it('counts both kinds and hides only the kind hidden in that section', () => {
    const result = applyActivitySectionKinds(groups, { 'section:inbox': { slack: false } }, isSlack)
    expect(result.groups[0].threads.map((t) => t.paneKey)).toEqual(['b'])
    expect(result.groups[0].kindCounts).toEqual({
      slack: 1,
      other: 1,
      slackShown: false,
      otherShown: true
    })
    expect(result.groups[1].threads.map((t) => t.paneKey)).toEqual(['c'])
    expect([...result.hiddenPaneKeys]).toEqual(['a'])
  })

  it('hides the other agents alone', () => {
    const result = applyActivitySectionKinds(groups, { 'section:inbox': { other: false } }, isSlack)
    expect(result.groups[0].threads.map((t) => t.paneKey)).toEqual(['a'])
  })
})
