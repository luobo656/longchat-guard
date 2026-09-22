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
      settings: { enabled: true, generationId: 'g1' },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          samples: [],
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
          messages: [],
          activeFingerprints: [],
          currentEstimatedLoad: 0,
          updatedAt: 1
        }
      }
    })

    const state = await loadState(storage)

    expect(state.schemaVersion).toBeGreaterThanOrEqual(5)
    expect(state.installSalt).toBe('keep-me')
    expect(state.generations[0]?.recentAssistantTokenCounts).toEqual([])
    expect(state.ledgers['chatgpt:one']?.completedAssistantFingerprints).toEqual([])
    expect(state.ledgers['chatgpt:one']?.dismissedFailureKeys).toEqual([])
    expect(state.conversationControls).toEqual({})
    expect(state.generations[0]?.verificationFactor).toBe(1)
    expect(state.generations[0]?.feedbackBias).toBe(0)
    expect(hasRequiredPrivacyConsent(state.settings)).toBe(false)
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
