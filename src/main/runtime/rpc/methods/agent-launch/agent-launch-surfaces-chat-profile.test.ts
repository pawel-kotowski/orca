import { describe, expect, it } from 'vitest'
import { launchSeedOptions } from './agent-launch-surfaces'

describe('a chat launch with a permission mode and a model', () => {
  it('keeps the model and effort beside the permission mode', () => {
    expect(
      launchSeedOptions({ permissionMode: 'full-access' }, { model: 'opus', effort: 'high' })
    ).toEqual({ model: 'opus', effort: 'high', permissionMode: 'full-access' })
    expect(launchSeedOptions(undefined, { model: 'opus' })).toEqual({ model: 'opus' })
    expect(launchSeedOptions(undefined, {})).toBeUndefined()
  })
})
