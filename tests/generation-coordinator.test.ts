import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import { summarizeGeneration } from '../src/core/calibration'
import type { LocalStorageArea } from '../src/core/storage'

class MemoryStorage implements LocalStorageArea {
  private readonly values = new Map<string, unknown>()

  async get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, unknown>> {
    if (typeof keys === 'string') return { [keys]: this.values.get(keys) }
    return Object.fromEntries(this.values.entries())
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.values.set(key, value)
  }
}

async function observeLoad(
  coordinator: StorageMutationCoordinator,
  conversationKey: string,
  tokenEstimate: number,
  observedAt: number
): Promise<void> {
  await coordinator.observeWindow({
    conversationKey,
    coverageState: 'complete',
    parserHealth: 'healthy',
    tailEvidence: 'at_tail',
    composerTokenEstimate: 0,
    observedAt,
    observedMessages: [{
      contentFingerprint: `content-${conversationKey}`,
      stableHintHash: `stable-${conversationKey}`,
      role: 'assistant',
      tokenEstimate,
      charCount: tokenEstimate * 2,
      observedAt
    }]
  })
}

describe('generation coordinator controls', () => {
  it('rejecting a medium length failure removes pending evidence without learning it', async () => {
    const coordinator = new StorageMutationCoordinator(new MemoryStorage())
    await observeLoad(coordinator, 'chatgpt:pending-no', 5000, 1)
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:pending-no',
      errorKind: 'conversation_length_limit',
      confidence: 'medium',
      composerTokenEstimate: 0,
      observedAt: 2
    })

    let state = await coordinator.loadState()
    let generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )!
    expect(generation.pendingFailureConfirmations).toHaveLength(1)

    await coordinator.confirmPendingFailure('chatgpt:pending-no', false, 3)
    state = await coordinator.loadState()
    generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )!
    expect(generation.pendingFailureConfirmations).toHaveLength(0)
    expect(summarizeGeneration(generation).failureCeiling).toBeUndefined()

    await coordinator.recordFailure({
      conversationKey: 'chatgpt:pending-no',
      errorKind: 'conversation_length_limit',
      confidence: 'medium',
      composerTokenEstimate: 0,
      observedAt: 4
    })
    state = await coordinator.loadState()
    generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )!
    expect(generation.pendingFailureConfirmations).toHaveLength(0)
  })

  it('accepting a medium length failure promotes it to confirmed failure evidence', async () => {
    const coordinator = new StorageMutationCoordinator(new MemoryStorage())
    await observeLoad(coordinator, 'chatgpt:pending-yes', 6000, 1)
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:pending-yes',
      errorKind: 'conversation_length_limit',
      confidence: 'medium',
      composerTokenEstimate: 0,
      observedAt: 2
    })
    await coordinator.confirmPendingFailure('chatgpt:pending-yes', true, 3)

    const state = await coordinator.loadState()
    const generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )!
    expect(generation.pendingFailureConfirmations).toHaveLength(0)
    expect(summarizeGeneration(generation).failureCeiling).toBe(6000)
  })

  it('creates a fresh generation after repeated independent earlier failures and seeds the latest boundary', async () => {
    const coordinator = new StorageMutationCoordinator(new MemoryStorage())

    await observeLoad(coordinator, 'chatgpt:old', 10000, 1)
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:old',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      observedAt: 2
    })

    await observeLoad(coordinator, 'chatgpt:early-1', 5000, 3)
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:early-1',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      observedAt: 4
    })

    await observeLoad(coordinator, 'chatgpt:early-2', 2000, 5)
    const result = await coordinator.recordFailure({
      conversationKey: 'chatgpt:early-2',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      observedAt: 6
    })

    const active = result.state.generations.find(
      (generation) => generation.id === result.state.settings.generationId
    )!
    const old = result.state.generations.find(
      (generation) => generation.id !== active.id
    )

    expect(result.state.generations).toHaveLength(2)
    expect(active.createdReason).toBe('auto_change')
    expect(active.samples).toHaveLength(1)
    expect(summarizeGeneration(active).failureCeiling).toBe(2000)
    expect(old?.archivedAt).toBe(6)
  })
})
