import { describe, expect, it } from 'vitest'
import { AnonymousConversationLedger } from '../src/core/ledger'

describe('anonymous conversation ledger', () => {
  it('does not double count a message that reappears in the DOM', () => {
    const ledger = new AnonymousConversationLedger()
    const record = {
      fingerprint: 'a',
      role: 'user' as const,
      tokenEstimate: 100,
      charCount: 200,
      observedAt: 1,
      localBranchId: 'main'
    }
    ledger.observe(record)
    ledger.observe(record)
    ledger.setActiveSequence(['a', 'a'])
    expect(ledger.size()).toBe(1)
    expect(ledger.estimatedActiveLoad()).toBe(100)
  })

  it('counts only the active regenerated branch', () => {
    const ledger = new AnonymousConversationLedger()
    for (const [fingerprint, tokenEstimate] of [
      ['m1', 100],
      ['old', 200],
      ['new', 300]
    ] as const) {
      ledger.observe({
        fingerprint,
        role: 'assistant',
        tokenEstimate,
        charCount: tokenEstimate,
        observedAt: 1,
        localBranchId: 'x'
      })
    }
    ledger.setActiveSequence(['m1', 'old'])
    expect(ledger.estimatedActiveLoad()).toBe(300)
    ledger.setActiveSequence(['m1', 'new'])
    expect(ledger.estimatedActiveLoad()).toBe(400)
  })

  it('serializes, restores, and merges duplicate observations from multiple tabs', () => {
    const firstTab = new AnonymousConversationLedger()
    firstTab.observe({
      fingerprint: 'shared',
      role: 'user',
      tokenEstimate: 10,
      charCount: 20,
      observedAt: 1,
      localBranchId: 'active'
    })
    firstTab.setActiveSequence(['shared'])

    const secondTab = new AnonymousConversationLedger()
    secondTab.observe({
      fingerprint: 'shared',
      role: 'user',
      tokenEstimate: 10,
      charCount: 20,
      observedAt: 2,
      localBranchId: 'active'
    })
    secondTab.observe({
      fingerprint: 'reply',
      role: 'assistant',
      tokenEstimate: 30,
      charCount: 90,
      observedAt: 3,
      localBranchId: 'active'
    })
    secondTab.setActiveSequence(['shared', 'reply'])

    firstTab.merge(secondTab)
    const snapshot = firstTab.toSnapshot({
      conversationKey: 'chatgpt:abc',
      generationId: 'g1',
      coverageState: 'complete',
      parserHealth: 'healthy',
      updatedAt: 4
    })
    const restored = AnonymousConversationLedger.fromSnapshot(snapshot)

    expect(restored.size()).toBe(2)
    expect(restored.estimatedActiveLoad()).toBe(40)
  })
})
