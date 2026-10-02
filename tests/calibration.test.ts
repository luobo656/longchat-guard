import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordFailureObservation,
  recordSuccessfulAssistantCompletion,
  seedGrowthHistory,
  summarizeGeneration,
  upsertConversationSample
} from '../src/core/calibration'
import {
  deriveLearningStage,
  hasLearnedRiskBoundary,
  shouldShowScanAction
} from '../src/content/app'

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

  it('moves learning presentation from initial calibration to stable only with broad safe and failure evidence', () => {
    expect(hasLearnedRiskBoundary(summarizeGeneration(createGeneration('empty-stage', 0)))).toBe(false)
    let generation = createGeneration('stage', 1)
    expect(deriveLearningStage(summarizeGeneration(generation))).toBe('learning')

    generation = recordFailureObservation(generation, {
      conversationKey: 'failure', generationId: 'stage', estimatedLoad: 100000,
      errorKind: 'conversation_length_limit', confidence: 'high', coverageState: 'complete',
      parserHealth: 'healthy', observedAt: 2
    })
    expect(deriveLearningStage(summarizeGeneration(generation))).toBe('initial')
    expect(hasLearnedRiskBoundary(summarizeGeneration(generation))).toBe(true)

    for (let index = 0; index < 5; index += 1) {
      generation = recordSuccessfulAssistantCompletion(generation, {
        conversationKey: `safe-${index}`,
        generationId: 'stage',
        estimatedLoad: 50000 + index * 1000,
        assistantTokenCount: 500,
        assistantFingerprint: `safe-${index}-tail`,
        coverageState: 'complete',
        parserHealth: 'healthy',
        observedAt: 3 + index
      })
      if (index === 0) {
        expect(deriveLearningStage(summarizeGeneration(generation))).toBe('calibrating')
      }
    }

    expect(deriveLearningStage(summarizeGeneration(generation))).toBe('stable')
  })

  it('hides manual scan after confirmed F and shows it again for a fresh generation', () => {
    let generation = createGeneration('scan-action', 1)
    expect(shouldShowScanAction(summarizeGeneration(generation))).toBe(true)
    generation = recordFailureObservation(generation, {
      conversationKey: 'limit',
      generationId: 'scan-action',
      estimatedLoad: 77324,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 2
    })
    expect(shouldShowScanAction(summarizeGeneration(generation))).toBe(false)
    const relearned = createGeneration('scan-action-2', 3, generation)
    expect(hasLearnedRiskBoundary(summarizeGeneration(relearned))).toBe(false)
    expect(shouldShowScanAction(summarizeGeneration(relearned))).toBe(true)
  })

  it('uses a robust low failure quantile so one extreme low outlier does not define F by itself', () => {
    let generation = createGeneration('robust-f', 1)
    for (const [index, load] of [1000, 78000, 80000, 82000].entries()) {
      generation = recordFailureObservation(generation, {
        conversationKey: `failure-${index}`,
        generationId: 'robust-f',
        estimatedLoad: load,
        errorKind: 'conversation_length_limit',
        confidence: 'high',
        coverageState: 'complete',
        parserHealth: 'healthy',
        observedAt: 10 + index
      })
    }
    const summary = summarizeGeneration(generation)
    expect(summary.failureBoundary).toBeGreaterThan(1000)
    expect(summary.failureBoundary).toBeLessThan(78000)
  })

  it('learns B from a high quantile of recent assistant growth and seeds history once per conversation', () => {
    let generation = createGeneration('growth', 1)
    generation = seedGrowthHistory(generation, 'chatgpt:old', [100, 200, 300, 400, 500])
    const first = summarizeGeneration(generation)
    expect(first.turnBuffer).toBe(500)
    expect(generation.growthHistoryConversationKeys).toEqual(['chatgpt:old'])

    generation = seedGrowthHistory(generation, 'chatgpt:old', [9999])
    expect(summarizeGeneration(generation).turnBuffer).toBe(500)
    expect(generation.growthHistoryConversationKeys).toEqual(['chatgpt:old'])
  })

  it('records one independent early-failure conflict only when F and B make it meaningful', () => {
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
    generation = seedGrowthHistory(generation, 'growth-source', [1000])
    generation = recordFailureObservation(generation, {
      conversationKey: 'new',
      generationId: 'g1',
      estimatedLoad: 8000,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      observedAt: 3
    })
    expect(generation.id).toBe('g1')
    expect(generation.environmentConflictKeys).toEqual(['failure:new'])
    expect(generation.suspiciousChangeCount).toBe(1)
    expect(generation.changePointSuggested).toBe(false)
  })
})
