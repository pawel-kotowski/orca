// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  activityHidesWorkbench,
  projectsHidesWorkbench,
  setActivityHidesWorkbench,
  setProjectsHidesWorkbench,
  showWorkbenchForBot
} from './activity-workbench-visibility'

describe('opening a bot', () => {
  afterEach(() => {
    setActivityHidesWorkbench(false)
    setProjectsHidesWorkbench(false)
    useAppStore.setState({ sidebarBody: 'workspaces' })
  })

  it('brings back the tabs the activity view hid', () => {
    useAppStore.setState({ sidebarBody: 'agents' })
    setActivityHidesWorkbench(true)
    expect(activityHidesWorkbench()).toBe(true)
    showWorkbenchForBot()
    expect(activityHidesWorkbench()).toBe(false)
  })

  it('brings back the tabs a Projects card hid', () => {
    setProjectsHidesWorkbench(true)
    showWorkbenchForBot()
    expect(projectsHidesWorkbench()).toBe(false)
  })
})
