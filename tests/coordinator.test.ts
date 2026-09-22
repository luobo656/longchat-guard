import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import type { LocalStorageArea } from '../src/core/storage'

class SlowMemoryStorage implements LocalStorageArea {
  private readonly values = new Map<string, unknown>()

  async get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, unknown>> {
    await delay(2)
    if (typeof keys === 'string') return { [keys]: this.values.get(keys) }
    return Object.fromEntries(this.values.entries())
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await delay(2)
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value)
    }
  }
}

describe('storage mutation coordinator', () => {
  it('serializes concurrent tab upserts without dropping anonymous messages', async () => {
    const coordinator = new StorageMutationCoordinator(new SlowMemoryStorage())
    await coordinator.loadState()

    const [first, second] = await Promise.all([
      coordinator.upsertLedger({
        conversationKey: 'chatgpt:shared',
        generationId: 'stale-tab-generation',
        coverageState: 'incomplete',
        parserHealth: 'healthy',
        messages: [
          {
            fingerprint: 'tab-a-message',
            role: 'user',
            tokenEstimate: 10,
            charCount: 40,
            observedAt: 1,
            localBranchId: 'active'
          }
        ],
        activeFingerprints: ['tab-a-message'],
        currentEstimatedLoad: 10,
        updatedAt: 1
      }),
      coordinator.upsertLedger({
        conversationKey: 'chatgpt:shared',
        generationId: 'another-stale-tab-generation',
        coverageState: 'incomplete',
        parserHealth: 'healthy',
        messages: [
          {
            fingerprint: 'tab-b-message',
            role: 'assistant',
            tokenEstimate: 30,
            charCount: 120,
            observedAt: 2,
            localBranchId: 'active'
          }
        ],
        activeFingerprints: ['tab-b-message'],
        currentEstimatedLoad: 30,
        updatedAt: 2
      })
    ])

    const finalState = second.state.ledgers['chatgpt:shared']
      ? second.state
      : first.state
    const ledger = finalState.ledgers['chatgpt:shared']

    expect(ledger?.messages.map((message) => message.fingerprint).sort()).toEqual([
      'tab-a-message',
      'tab-b-message'
    ])
    expect(ledger?.generationId).toBe(finalState.settings.generationId)
  })

  it('merges the same stable-hint message observed by two tabs into one instance', async () => {
    const coordinator = new StorageMutationCoordinator(new SlowMemoryStorage())
    await Promise.all([
      coordinator.observeWindow({
        conversationKey: 'chatgpt:stable',
        coverageState: 'complete',
        parserHealth: 'healthy',
        tailEvidence: 'at_tail',
        composerTokenEstimate: 0,
        observedAt: 10,
        observedMessages: [
          {
            contentFingerprint: 'same-content',
            stableHintHash: 'stable-hint',
            role: 'assistant',
            tokenEstimate: 20,
            charCount: 80,
            observedAt: 10
          }
        ]
      }),
      coordinator.observeWindow({
        conversationKey: 'chatgpt:stable',
        coverageState: 'complete',
        parserHealth: 'healthy',
        tailEvidence: 'at_tail',
        composerTokenEstimate: 0,
        observedAt: 11,
        observedMessages: [
          {
            contentFingerprint: 'same-content',
            stableHintHash: 'stable-hint',
            role: 'assistant',
            tokenEstimate: 20,
            charCount: 80,
            observedAt: 11
          }
        ]
      })
    ])

    const final = await coordinator.loadState()
    const ledger = final.ledgers['chatgpt:stable']

    expect(ledger?.messages).toHaveLength(1)
    expect(ledger?.activeFingerprints).toHaveLength(1)
    expect(ledger?.currentEstimatedLoad).toBe(20)
  })

  it('returns risk after observeWindow without using composer as a risk input', async () => {
    const coordinator = new StorageMutationCoordinator(new SlowMemoryStorage())
    const result = await coordinator.observeWindow({
      conversationKey: 'chatgpt:risk',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      composerTokenEstimate: 50,
      observedAt: 10,
      observedMessages: [
        {
          contentFingerprint: 'user',
          role: 'user',
          tokenEstimate: 100,
          charCount: 300,
          observedAt: 10
        }
      ]
    })

    expect(result.snapshot.currentEstimatedLoad).toBe(100)
    expect(result.risk.predictedNextTurnLoad).toBe(100)
  })

  it('records completion and failure events idempotently without error pollution', async () => {
    const coordinator = new StorageMutationCoordinator(new SlowMemoryStorage())
    await coordinator.observeWindow({
      conversationKey: 'chatgpt:events',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      composerTokenEstimate: 0,
      observedAt: 10,
      observedMessages: [
        {
          contentFingerprint: 'answer',
          stableHintHash: 'answer-id',
          role: 'assistant',
          tokenEstimate: 120,
          charCount: 360,
          observedAt: 10
        }
      ]
    })
    await coordinator.recordCompletion({
      conversationKey: 'chatgpt:events',
      assistantFingerprint: 'stable:answer-id',
      estimatedLoad: 120,
      assistantTokenCount: 120,
      observedAt: 20
    })
    await coordinator.recordCompletion({
      conversationKey: 'chatgpt:events',
      assistantFingerprint: 'stable:answer-id',
      estimatedLoad: 120,
      assistantTokenCount: 120,
      observedAt: 21
    })
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:events',
      errorKind: 'network_error',
      confidence: 'high',
      composerTokenEstimate: 0,
      observedAt: 22
    })
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:events',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 10,
      observedAt: 23
    })
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:events',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 10,
      observedAt: 24
    })
    const state = await coordinator.loadState()
    const generation = state.generations.find((item) => item.id === state.settings.generationId)
    const sample = generation?.samples.find((item) => item.conversationKey === 'chatgpt:events')

    expect(generation?.recentAssistantTokenCounts).toEqual([120])
    expect(sample?.highestConfirmedSafeLoad).toBe(120)
    expect(sample?.firstConfirmedFailureLoad).toBe(130)
    expect(state.ledgers['chatgpt:events']?.confirmedFailureFingerprints).toHaveLength(1)
  })
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
