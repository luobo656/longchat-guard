import { describe, expect, it } from 'vitest'
import { resolveCoverageLifecycle } from '../src/content/app'

describe('coverage lifecycle', () => {
  it('arms only on a truly blank root chat page', () => {
    const result = resolveCoverageLifecycle({
      isRoot: true,
      hasConversationId: false,
      messageCount: 0,
      hasUserMessage: false,
      blankStartArmed: false,
      pendingBlankStart: false,
      persistedComplete: false
    })

    expect(result.blankStartArmed).toBe(true)
    expect(result.pendingBlankStart).toBe(false)
    expect(result.coverageEvidence).toBe('none')
  })

  it('marks the session observed from start only after the first sent user message', () => {
    const afterSendBeforeDom = resolveCoverageLifecycle({
      isRoot: true,
      hasConversationId: false,
      messageCount: 0,
      hasUserMessage: false,
      blankStartArmed: true,
      pendingBlankStart: true,
      persistedComplete: false
    })
    expect(afterSendBeforeDom.pendingBlankStart).toBe(true)
    expect(afterSendBeforeDom.coverageEvidence).toBe('observed_from_start')

    const firstUser = resolveCoverageLifecycle({
      isRoot: true,
      hasConversationId: false,
      messageCount: 1,
      hasUserMessage: true,
      blankStartArmed: true,
      pendingBlankStart: false,
      persistedComplete: false
    })
    const migrated = resolveCoverageLifecycle({
      isRoot: false,
      hasConversationId: true,
      messageCount: 2,
      hasUserMessage: true,
      blankStartArmed: firstUser.blankStartArmed,
      pendingBlankStart: firstUser.pendingBlankStart,
      persistedComplete: false
    })

    expect(firstUser.pendingBlankStart).toBe(true)
    expect(migrated.coverageEvidence).toBe('observed_from_start')
  })

  it('keeps the send signal across an early URL migration before the first message renders', () => {
    const migrated = resolveCoverageLifecycle({
      isRoot: false,
      hasConversationId: true,
      messageCount: 0,
      hasUserMessage: false,
      blankStartArmed: true,
      pendingBlankStart: true,
      persistedComplete: false
    })

    expect(migrated.pendingBlankStart).toBe(true)
    expect(migrated.coverageEvidence).toBe('observed_from_start')
  })

  it('does not let a homepage history click inherit complete coverage', () => {
    const historyClick = resolveCoverageLifecycle({
      isRoot: false,
      hasConversationId: true,
      messageCount: 8,
      hasUserMessage: true,
      blankStartArmed: true,
      pendingBlankStart: false,
      persistedComplete: false
    })

    expect(historyClick.blankStartArmed).toBe(false)
    expect(historyClick.pendingBlankStart).toBe(false)
    expect(historyClick.coverageEvidence).toBe('none')
  })

  it('keeps refreshed persisted complete conversations complete', () => {
    const result = resolveCoverageLifecycle({
      isRoot: false,
      hasConversationId: true,
      messageCount: 4,
      hasUserMessage: true,
      blankStartArmed: false,
      pendingBlankStart: false,
      persistedComplete: true
    })

    expect(result.coverageEvidence).toBe('persisted_complete')
  })

  it('keeps directly opened old conversation pages incomplete', () => {
    const result = resolveCoverageLifecycle({
      isRoot: false,
      hasConversationId: true,
      messageCount: 4,
      hasUserMessage: true,
      blankStartArmed: false,
      pendingBlankStart: false,
      persistedComplete: false
    })

    expect(result.coverageEvidence).toBe('none')
  })
})
