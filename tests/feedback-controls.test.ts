import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import { assessRisk } from '../src/core/risk-engine'
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

describe('feedback and conversation controls', () => {
  it('persists per-conversation mute and snooze controls', async () => {
    const coordinator = new StorageMutationCoordinator(new MemoryStorage())
    await coordinator.updateControl('chatgpt:one', {
      muted: true,
      snoozeUntilUserTurn: 12
    })
    const state = await coordinator.loadState()

    expect(state.conversationControls['chatgpt:one']).toMatchObject({
      muted: true,
      snoozeUntilUserTurn: 12
    })
  })

  it('keeps subjective timing feedback low-weight and bounded', async () => {
    const coordinator = new StorageMutationCoordinator(new MemoryStorage())
    for (let index = 0; index < 5; index += 1) {
      await coordinator.recordFeedback('too_late')
    }
    let state = await coordinator.loadState()
    let generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )
    expect(generation?.feedbackBias).toBe(6)

    for (let index = 0; index < 10; index += 1) {
      await coordinator.recordFeedback('too_early')
    }
    state = await coordinator.loadState()
    generation = state.generations.find(
      (item) => item.id === state.settings.generationId
    )
    expect(generation?.feedbackBias).toBe(-6)
  })

  it('cannot demote a confirmed failure boundary out of high risk', () => {
    const result = assessRisk({
      currentLoad: 100000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 1,
      failureCeiling: 100000,
      estimatedRiskStart: 85000,
      estimatedHighRisk: 95000,
      feedbackBias: -6
    })

    expect(result.level).toBe('high')
  })
})
