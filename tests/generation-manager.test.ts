import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  summarizeGeneration,
  upsertConversationSample
} from '../src/core/calibration'
import {
  clearLearningData,
  restoreGeneration,
  startNewGeneration
} from '../src/core/generation-manager'
import { assessRisk } from '../src/core/risk-engine'
import type { PersistedState } from '../src/core/storage'

function calibratedState(): PersistedState {
  let generation = createGeneration('g1', 1)
  generation.createdReason = 'initial'
  generation = upsertConversationSample(generation, {
    conversationKey: 'c1',
    generationId: 'g1',
    highestConfirmedSafeLoad: 90000,
    firstConfirmedFailureLoad: 100000,
    coverageState: 'complete',
    parserHealth: 'healthy',
    updatedAt: 2
  })
  return {
    schemaVersion: 4,
    installSalt: 'keep-salt',
    settings: { enabled: true, generationId: 'g1' },
    generations: [generation],
    conversationControls: {},
    ledgers: {
      'chatgpt:c1': {
        conversationKey: 'chatgpt:c1',
        generationId: 'g1',
        coverageState: 'complete',
        parserHealth: 'healthy',
        messages: [],
        activeFingerprints: [],
        currentEstimatedLoad: 90000,
        updatedAt: 2
      }
    }
  }
}

describe('generation manager', () => {
  it('starts a new environment generation without copying old samples', () => {
    const before = calibratedState()
    const after = startNewGeneration(before, 'environment_change', 10)
    const current = after.generations.find(
      (generation) => generation.id === after.settings.generationId
    )
    const old = after.generations.find((generation) => generation.id === 'g1')

    expect(old?.archivedAt).toBe(10)
    expect(current?.createdReason).toBe('environment_change')
    expect(current?.samples).toEqual([])
    expect(current?.warmStartedFrom).toBe('g1')
    expect(current?.warmStartPrior?.sourceGenerationId).toBe('g1')

    const summary = summarizeGeneration(current!)
    expect(summary.usingWarmStartPrior).toBe(true)
    expect(summary.confidence).toBeLessThanOrEqual(0.3)
  })

  it('restores an old generation with reduced verification confidence', () => {
    const started = startNewGeneration(calibratedState(), 'recalibrate', 10)
    const restored = restoreGeneration(started, 'g1', 20)
    const active = restored.generations.find((generation) => generation.id === 'g1')

    expect(restored.settings.generationId).toBe('g1')
    expect(active?.archivedAt).toBeUndefined()
    expect(active?.verificationFactor).toBeLessThanOrEqual(0.6)
    expect(summarizeGeneration(active!).confidence).toBeLessThan(
      summarizeGeneration(calibratedState().generations[0]!).confidence
    )
  })

  it('clears learning while preserving installation identity and enabled setting', () => {
    const cleared = clearLearningData(calibratedState(), 20)

    expect(cleared.installSalt).toBe('keep-salt')
    expect(cleared.settings.enabled).toBe(true)
    expect(cleared.ledgers).toEqual({})
    expect(cleared.generations).toHaveLength(1)
    expect(cleared.generations[0]?.samples).toEqual([])
    expect(cleared.generations[0]?.createdReason).toBe('initial')
  })

  it('keeps a weak warm-start prior from creating a strong warning by itself', () => {
    const result = assessRisk({
      currentLoad: 300000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.2,
      estimatedRiskStart: 85000,
      estimatedHighRisk: 100000,
      usingWarmStartPrior: true
    })

    expect(['normal', 'long']).toContain(result.level)
    expect(result.level).not.toBe('organize')
    expect(result.level).not.toBe('high')
  })
})
