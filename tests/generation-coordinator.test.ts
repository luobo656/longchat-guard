import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import {
  deriveCalibrationState
} from '../src/core/product-state'
import type {
  LocalStorageArea
} from '../src/core/storage'

class MemoryStorage implements LocalStorageArea {
  private readonly values = new Map<string, unknown>()

  async get(
    keys?: string[] | Record<string, unknown> | string | null
  ): Promise<Record<string, unknown>> {
    if (typeof keys === 'string') {
      return { [keys]: this.values.get(keys) }
    }
    return Object.fromEntries(this.values)
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value)
    }
  }
}

const env = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v2',
  measurementSchemaVersion: 2,
  modelHint: 'GPT Fixture'
} as const

describe('generation coordinator', () => {
  it('makes a previously calibrated reference stale after relearn', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()

    await coordinator.commitCalibration({
      conversationKey: 'chatgpt:limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-1',
      environmentSignature: env,
      uncertaintySources: [],
      observedMessages: [
        {
          contentFingerprint: 'u',
          role: 'user',
          tokenEstimate: 20_000,
          charCount: 80_000,
          observedAt: 1
        },
        {
          contentFingerprint: 'a',
          role: 'assistant',
          tokenEstimate: 40_000,
          charCount: 160_000,
          observedAt: 1
        }
      ],
      observedAt: 2
    })

    const recalibrated = await coordinator.startGeneration(
      'recalibrate',
      3
    )
    const generation = recalibrated.generations[0]!

    expect(generation.warmStartPrior?.failureReference?.load).toBe(
      60_000
    )
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('stale')
  })

  it('clear learning drops even the stale prior', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    await coordinator.startGeneration('recalibrate', 2)
    const cleared = await coordinator.clearLearning(3)

    expect(cleared.generations[0]?.warmStartPrior).toBeUndefined()
    expect(cleared.ledgers).toEqual({})
    expect(cleared.conversationControls).toEqual({})
    expect(cleared.settings.generationId).not.toBe(
      initial.settings.generationId
    )
  })
})
