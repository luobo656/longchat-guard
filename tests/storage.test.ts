import { describe, expect, it } from 'vitest'
import {
  hasDismissedPrivacyConsent,
  hasRequiredPrivacyConsent,
  loadState,
  type LocalStorageArea,
  upsertLedgerSnapshot,
  withPrivacyConsent
} from '../src/core/storage'

class MemoryStorage implements LocalStorageArea {
  private readonly values = new Map<string, unknown>()

  seed(key: string, value: unknown): void {
    this.values.set(key, value)
  }

  async get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, unknown>> {
    if (typeof keys === 'string') return { [keys]: this.values.get(keys) }
    return Object.fromEntries(this.values.entries())
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value)
    }
  }
}

describe('chrome local storage persistence model', () => {
  it('initializes durable anonymous state and restores it after restart', async () => {
    const storage = new MemoryStorage()
    const first = await loadState(storage)
    const second = await loadState(storage)

    expect(first.installSalt).toBeTruthy()
    expect(second.installSalt).toBe(first.installSalt)
    expect(second.generations).toHaveLength(1)
  })

  it('serializes ledgers without raw text and merges tab refreshes', async () => {
    const storage = new MemoryStorage()
    await upsertLedgerSnapshot(storage, {
      conversationKey: 'chatgpt:one',
      generationId: 'g1',
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      messages: [
        {
          fingerprint: 'm1',
          role: 'user',
          tokenEstimate: 12,
          charCount: 48,
          observedAt: 1,
          localBranchId: 'active'
        }
      ],
      activeFingerprints: ['m1'],
      currentEstimatedLoad: 12,
      updatedAt: 1
    })
    const state = await upsertLedgerSnapshot(storage, {
      conversationKey: 'chatgpt:one',
      generationId: 'g1',
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      messages: [
        {
          fingerprint: 'm1',
          role: 'user',
          tokenEstimate: 12,
          charCount: 48,
          observedAt: 2,
          localBranchId: 'active'
        },
        {
          fingerprint: 'm2',
          role: 'assistant',
          tokenEstimate: 30,
          charCount: 120,
          observedAt: 3,
          localBranchId: 'active'
        }
      ],
      activeFingerprints: ['m1', 'm2'],
      currentEstimatedLoad: 42,
      updatedAt: 3
    })

    const ledger = state.ledgers['chatgpt:one']
    expect(ledger?.messages).toHaveLength(2)
    expect(JSON.stringify(ledger)).not.toContain('raw')
    expect(JSON.stringify(ledger)).not.toContain('Visible tail')
    expect(ledger?.currentEstimatedLoad).toBe(42)
  })

  it('migrates old state while preserving install salt, ledgers, and generations', async () => {
    const storage = new MemoryStorage()
    storage.seed('conversationGuardState', {
      installSalt: 'keep-me',
      settings: {
        enabled: true,
        generationId: 'g1',
        privacyConsentVersion: 1,
        privacyConsentedAt: 77
      },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          samples: [{
            conversationKey: 'chatgpt:legacy-limit',
            generationId: 'g1',
            firstConfirmedFailureLoad: 77324,
            coverageState: 'mostly_complete',
            parserHealth: 'healthy',
            failureEvidenceQuality: 'confirmed',
            updatedAt: 2
          }],
          confidence: 0.05,
          suspiciousChangeCount: 0
        }
      ],
      ledgers: {
        'chatgpt:one': {
          conversationKey: 'chatgpt:one',
          generationId: 'g1',
          coverageState: 'complete',
          parserHealth: 'healthy',
          messages: [
            {
              fingerprint: 'legacy-a',
              role: 'assistant',
              tokenEstimate: 900,
              charCount: 3600,
              observedAt: 1,
              localBranchId: 'active'
            },
            {
              fingerprint: 'legacy-b',
              role: 'assistant',
              tokenEstimate: 1800,
              charCount: 7200,
              observedAt: 2,
              localBranchId: 'active'
            }
          ],
          activeFingerprints: ['legacy-a', 'legacy-b'],
          currentEstimatedLoad: 2700,
          updatedAt: 1
        }
      }
    })

    const state = await loadState(storage)

    expect(state.schemaVersion).toBeGreaterThanOrEqual(8)
    expect(state.installSalt).toBe('keep-me')
    expect(state.generations[0]?.recentAssistantTokenCounts).toEqual([900, 1800])
    expect(state.generations[0]?.growthHistoryConversationKeys).toEqual(['chatgpt:one'])
    expect(state.generations[0]?.environmentConflictKeys).toEqual([])
    expect(state.generations[0]?.samples[0]?.firstConfirmedFailureLoad).toBe(77324)
    expect(state.generations[0]?.samples.some((sample) =>
      sample.conversationKey === 'chatgpt:one' && sample.highestConfirmedSafeLoad === 2700
    )).toBe(true)
    expect(state.ledgers['chatgpt:one']?.completedAssistantFingerprints).toEqual([])
    expect(state.ledgers['chatgpt:one']?.dismissedFailureKeys).toEqual([])
    expect(state.conversationControls).toEqual({})
    expect(state.generations[0]?.verificationFactor).toBe(1)
    expect(hasRequiredPrivacyConsent(state.settings)).toBe(true)
    expect(state.settings.privacyConsentedAt).toBe(77)
  })

  it('compacts persisted conversation state to recent anonymous length evidence', async () => {
    const storage = new MemoryStorage()
    const initial = await loadState(storage)
    for (let index = 0; index < 12; index += 1) {
      await upsertLedgerSnapshot(storage, {
        conversationKey: `chatgpt:${index}`,
        generationId: initial.settings.generationId,
        coverageState: 'complete',
        parserHealth: 'healthy',
        messages: Array.from({ length: 40 }, (_, messageIndex) => ({
          fingerprint: `m-${index}-${messageIndex}`,
          contentFingerprint: `h-${index}-${messageIndex}`,
          role: messageIndex % 2 === 0 ? 'user' as const : 'assistant' as const,
          tokenEstimate: 10,
          charCount: 999,
          observedAt: index * 100 + messageIndex,
          localBranchId: 'active',
          ordinalHint: messageIndex,
          hasCode: true,
          attachmentCount: 3
        })),
        activeFingerprints: Array.from({ length: 40 }, (_, messageIndex) => `m-${index}-${messageIndex}`),
        currentEstimatedLoad: 400,
        updatedAt: index + 1
      })
    }

    const reloaded = await loadState(storage)
    expect(Object.keys(reloaded.ledgers)).toHaveLength(8)
    expect(reloaded.ledgers['chatgpt:0']).toBeUndefined()
    const latest = reloaded.ledgers['chatgpt:11']!
    expect(latest.messages).toHaveLength(32)
    expect(latest.retainedPrefixLoad).toBe(80)
    expect(latest.currentEstimatedLoad).toBe(400)
    expect(latest.messages[0]).not.toHaveProperty('charCount')
    expect(latest.messages[0]).not.toHaveProperty('localBranchId')
    expect(latest.messages[0]).not.toHaveProperty('ordinalHint')
    expect(latest.messages[0]).not.toHaveProperty('hasCode')
    expect(latest.messages[0]).not.toHaveProperty('attachmentCount')
  })

  it('bounds per-conversation control state to the most recent entries', async () => {
    const storage = new MemoryStorage()
    const initial = await loadState(storage)
    storage.seed('conversationGuardState', {
      ...initial,
      conversationControls: Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [
          `chatgpt:control-${index}`,
          { muted: index % 2 === 0, updatedAt: index + 1 }
        ])
      )
    })

    const reloaded = await loadState(storage)
    expect(Object.keys(reloaded.conversationControls)).toHaveLength(16)
    expect(reloaded.conversationControls['chatgpt:control-19']).toBeDefined()
    expect(reloaded.conversationControls['chatgpt:control-0']).toBeUndefined()
  })

  it('records affirmative privacy consent and keeps declined consent disabled', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    const accepted = withPrivacyConsent(state, true, 123)
    const declined = withPrivacyConsent(accepted, false, 456)

    expect(hasRequiredPrivacyConsent(accepted.settings)).toBe(true)
    expect(accepted.settings.privacyConsentVersion).toBe(1)
    expect(accepted.settings.privacyConsentedAt).toBe(123)
    expect(hasRequiredPrivacyConsent(declined.settings)).toBe(false)
    expect(declined.settings.privacyConsentVersion).toBeUndefined()
    expect(declined.settings.privacyConsentedAt).toBeUndefined()
    expect(hasDismissedPrivacyConsent(declined.settings)).toBe(true)
    expect(declined.settings.privacyConsentDismissedAt).toBe(456)
  })
})
