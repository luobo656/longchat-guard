import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordFailureObservation,
  recordSuccessfulAssistantCompletion,
  summarizeGeneration,
  upsertConversationSample
} from '../src/core/calibration'

describe('calibration', () => {
  it('uses independent conversation boundaries instead of per-turn averaging', () => {
    let generation = createGeneration('g1', 1)
    generation = upsertConversationSample(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      highestConfirmedSafeLoad: 96000,
      firstConfirmedFailureLoad: 102000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      successEvidenceQuality: 'complete',
      updatedAt: 2
    })
    generation = upsertConversationSample(generation, {
      conversationKey: 'b',
      generationId: 'g1',
      highestConfirmedSafeLoad: 99000,
      firstConfirmedFailureLoad: 105000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      successEvidenceQuality: 'complete',
      updatedAt: 3
    })

    const summary = summarizeGeneration(generation)
    expect(summary.safeFloor).toBe(99000)
    expect(summary.failureCeiling).toBe(102000)
    expect(summary.independentConversations).toBe(2)
  })

  it('updates the same conversation instead of multiplying its weight', () => {
    let generation = createGeneration('g1', 1)
    generation = upsertConversationSample(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      highestConfirmedSafeLoad: 50000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      successEvidenceQuality: 'complete',
      updatedAt: 2
    })
    generation = upsertConversationSample(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      highestConfirmedSafeLoad: 90000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      successEvidenceQuality: 'complete',
      updatedAt: 3
    })
    expect(generation.samples).toHaveLength(1)
    expect(summarizeGeneration(generation).safeFloor).toBe(90000)
  })

  it('keeps safe-floor-only estimated risk start at the confirmed safe floor', () => {
    let generation = createGeneration('g1', 1)
    generation = upsertConversationSample(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      highestConfirmedSafeLoad: 90000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      updatedAt: 2
    })
    const summary = summarizeGeneration(generation)
    expect(summary.safeFloor).toBe(90000)
    expect(summary.failureCeiling).toBeUndefined()
    expect(summary.estimatedRiskStart).toBeGreaterThanOrEqual(90000)
  })

  it('records successful completions idempotently per conversation sample and keeps max safe floor', () => {
    let generation = createGeneration('g1', 1)
    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 1000,
      assistantTokenCount: 100,
      assistantFingerprint: 'r1',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 1500,
      assistantTokenCount: 200,
      assistantFingerprint: 'r2',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 3
    })

    expect(generation.samples).toHaveLength(1)
    expect(summarizeGeneration(generation).safeFloor).toBe(1500)
  })

  it('does not let incomplete success establish a confirmed safe floor', () => {
    let complete = createGeneration('g1', 1)
    let incomplete = createGeneration('g1', 1)
    complete = recordSuccessfulAssistantCompletion(complete, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 1000,
      assistantTokenCount: 100,
      assistantFingerprint: 'r1',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    incomplete = recordSuccessfulAssistantCompletion(incomplete, {
      conversationKey: 'b',
      generationId: 'g1',
      estimatedLoad: 1000,
      assistantTokenCount: 100,
      assistantFingerprint: 'r1',
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      observedAt: 2
    })

    expect(summarizeGeneration(incomplete).confidence).toBeLessThan(summarizeGeneration(complete).confidence)
    expect(summarizeGeneration(incomplete).safeFloor).toBeUndefined()
    expect(summarizeGeneration(incomplete).confirmedSafeConversations).toBe(0)
  })

  it('requires multiple independent complete successes before safe-floor-only strong warnings are enabled', () => {
    let generation = createGeneration('g1', 1)
    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 1600,
      assistantTokenCount: 200,
      assistantFingerprint: 'r1',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    let summary = summarizeGeneration(generation)
    expect(summary.safeFloor).toBe(1600)
    expect(summary.confirmedSafeConversations).toBe(1)
    expect(summary.safeFloorEvidenceReady).toBe(false)

    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'b',
      generationId: 'g1',
      estimatedLoad: 1800,
      assistantTokenCount: 180,
      assistantFingerprint: 'r2',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 3
    })
    summary = summarizeGeneration(generation)
    expect(summary.safeFloor).toBe(1800)
    expect(summary.confirmedSafeConversations).toBe(2)
    expect(summary.safeFloorEvidenceReady).toBe(true)
  })

  it('only high confidence conversation length failure updates failure ceiling', () => {
    let generation = createGeneration('g1', 1)
    generation = recordFailureObservation(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 2000,
      errorKind: 'conversation_length_limit',
      confidence: 'medium',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    expect(summarizeGeneration(generation).failureCeiling).toBeUndefined()
    expect(generation.pendingFailureConfirmations).toHaveLength(1)

    generation = recordFailureObservation(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      estimatedLoad: 2000,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 3
    })
    expect(summarizeGeneration(generation).failureCeiling).toBe(2000)
  })

  it('does not let usage or network errors pollute failure ceiling', () => {
    let generation = createGeneration('g1', 1)
    for (const errorKind of ['model_usage_limit', 'network_error', 'file_error'] as const) {
      generation = recordFailureObservation(generation, {
        conversationKey: errorKind,
        generationId: 'g1',
        estimatedLoad: 2000,
        errorKind,
        confidence: 'high',
        coverageState: 'complete',
        parserHealth: 'healthy',
        observedAt: 2
      })
    }
    expect(summarizeGeneration(generation).failureCeiling).toBeUndefined()
  })

  it('contradictory safe and failure bounds reduce confidence and keep conservative reasons', () => {
    let generation = createGeneration('g1', 1)
    generation = upsertConversationSample(generation, {
      conversationKey: 'a',
      generationId: 'g1',
      highestConfirmedSafeLoad: 5000,
      firstConfirmedFailureLoad: 3000,
      coverageState: 'complete',
      parserHealth: 'healthy',
      updatedAt: 2
    })
    const summary = summarizeGeneration(generation)
    expect(summary.contradictory).toBe(true)
    expect(summary.confidence).toBeLessThan(0.4)
    expect(summary.reasons).toContain('contradictory_safe_and_failure_bounds')
  })

  it('suspicious early failure increments change-point signal without switching generation', () => {
    let generation = createGeneration('g1', 1)
    generation = recordFailureObservation(generation, {
      conversationKey: 'old',
      generationId: 'g1',
      estimatedLoad: 10000,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    generation = recordFailureObservation(generation, {
      conversationKey: 'new',
      generationId: 'g1',
      estimatedLoad: 5000,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 3
    })
    expect(generation.id).toBe('g1')
    expect(generation.suspiciousChangeCount).toBe(1)
    expect(generation.changePointSuggested).toBe(false)
  })
})
