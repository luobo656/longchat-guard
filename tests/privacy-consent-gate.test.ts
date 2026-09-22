import { describe, expect, it } from 'vitest'
import { canStartMonitoring } from '../src/content/app'

describe('privacy consent monitoring gate', () => {
  it('blocks monitoring before affirmative consent', () => {
    expect(canStartMonitoring({})).toBe(false)
    expect(
      canStartMonitoring({
        privacyConsentVersion: 1
      })
    ).toBe(false)
  })

  it('allows monitoring after affirmative consent', () => {
    expect(
      canStartMonitoring({
        privacyConsentVersion: 1,
        privacyConsentedAt: 123
      })
    ).toBe(true)
  })

  it('treats declined consent as disabled', () => {
    expect(canStartMonitoring({ privacyConsentVersion: 0 })).toBe(false)
  })
})
