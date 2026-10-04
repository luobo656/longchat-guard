import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordConfirmedFailureReference,
  recordTurnGrowth
} from '../src/core/calibration'
import {
  clearLearningData,
  startNewGeneration
} from '../src/core/generation-manager'
import type { PersistedState } from '../src/core/storage'

const env = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v2',
  measurementSchemaVersion: 2,
  modelHint: 'GPT Fixture'
} as const

function stateWith(generation = createGeneration('g1', 1)): PersistedState {
  return {
    schemaVersion: 10,
    installSalt: 'salt',
    settings: { enabled: true, generationId: generation.id },
    generations: [generation],
    ledgers: {},
    conversationControls: {}
  }
}

describe('generation manager', () => {
  it('recalibration carries only stale prior reference evidence', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'limit',
      generationId: 'g1',
      estimatedLoad: 60_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })
    generation = recordTurnGrowth(generation, {
      conversationKey: 'growth',
      generationId: 'g1',
      beforeLoad: 1_000,
      afterLoad: 3_000,
      delta: 2_000,
      uncertain: false,
      uncertaintySources: [],
      observedAt: 3
    })

    const next = startNewGeneration(
      stateWith(generation),
      'recalibrate',
      10
    )
    const active = next.generations[0]!

    expect(active.createdReason).toBe('recalibrate')
    expect(active.warmStartPrior?.failureReference?.load).toBe(60_000)
    expect(active.samples).toEqual([])
    expect(active.turnGrowthSamples).toEqual([])
    expect(active.environmentSignature).toBeUndefined()
  })

  it('environment changes also force a fresh generation', () => {
    const next = startNewGeneration(
      stateWith(),
      'environment_change',
      20
    )
    expect(next.generations[0]?.createdReason).toBe(
      'environment_change'
    )
    expect(next.settings.generationId).toBe(
      next.generations[0]?.id
    )
  })

  it('clear learning removes calibration, ledgers and controls', () => {
    const state = stateWith()
    state.ledgers = {
      old: {} as never
    }
    state.conversationControls = {
      old: { muted: true }
    }

    const cleared = clearLearningData(state, 30)
    expect(cleared.generations).toHaveLength(1)
    expect(cleared.generations[0]?.samples).toEqual([])
    expect(cleared.generations[0]?.warmStartPrior).toBeUndefined()
    expect(cleared.ledgers).toEqual({})
    expect(cleared.conversationControls).toEqual({})
  })
})
