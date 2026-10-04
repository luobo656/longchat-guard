import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordConfirmedFailureReference,
  recordFailureObservation,
  recordSuccessfulAssistantCompletion,
  recordTurnGrowth,
  summarizeGeneration
} from '../src/core/calibration'

const env = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v2',
  measurementSchemaVersion: 2,
  modelHint: 'GPT Fixture'
} as const

const envWithoutModel = {
  parserSchemaVersion: env.parserSchemaVersion,
  measurementSchemaVersion: env.measurementSchemaVersion
} as const

describe('calibration evidence model', () => {
  it('keeps passive length errors pending instead of creating a usable failure reference', () => {
    let generation = createGeneration('g1', 1)
    generation = recordFailureObservation(generation, {
      conversationKey: 'chat',
      generationId: 'g1',
      estimatedLoad: 50_000,
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    expect(generation.pendingFailureConfirmations).toHaveLength(1)
    expect(summarizeGeneration(generation).failureReference).toBeUndefined()
  })

  it('records explicit complete attachment-free calibration as a strong reference', () => {
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

    const summary = summarizeGeneration(generation)
    expect(summary.failureReference).toEqual({
      load: 60_000,
      quality: 'strong',
      sourceConversationCount: 1
    })
    expect(generation.environmentSignature).toEqual(env)
  })

  it('downgrades an otherwise strong model-unverified calibration to conservative', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'limit-model-unverified',
      generationId: 'g1',
      estimatedLoad: 60_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: envWithoutModel,
      observedAt: 2
    })

    expect(summarizeGeneration(generation).failureReference).toEqual({
      load: 60_000,
      quality: 'conservative',
      sourceConversationCount: 1
    })
  })

  it('records complete attachment-bearing calibration as conservative', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'limit-with-file',
      generationId: 'g1',
      estimatedLoad: 52_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: ['attachment'],
      environmentSignature: env,
      observedAt: 2
    })

    expect(
      summarizeGeneration(generation).failureReference?.quality
    ).toBe('conservative')
  })

  it('keeps incomplete or degraded calibration provisional and unusable', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'partial-limit',
      generationId: 'g1',
      estimatedLoad: 40_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'mostly_complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    const summary = summarizeGeneration(generation)
    expect(summary.failureReference).toBeUndefined()
    expect(summary.provisionalFailureReference).toBe(40_000)
    expect(generation.environmentSignature).toBeUndefined()
  })

  it('keeps sequence-uncertain calibration provisional even when coverage and parser look healthy', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'uncertain-sequence-limit',
      generationId: 'g1',
      estimatedLoad: 41_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'uncertain',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    const summary = summarizeGeneration(generation)
    expect(summary.failureReference).toBeUndefined()
    expect(summary.provisionalFailureReference).toBe(41_000)
  })

  it('keeps successful completions as internal safe evidence only', () => {
    let generation = createGeneration('g1', 1)
    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'safe',
      generationId: 'g1',
      estimatedLoad: 45_000,
      assistantFingerprint: 'assistant-1',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    const summary = summarizeGeneration(generation)
    expect(summary.safeEvidenceLoad).toBe(45_000)
    expect(summary.failureReference).toBeUndefined()
  })

  it('learns the reserve from whole-turn deltas and ignores uncertain samples', () => {
    let generation = createGeneration('g1', 1)
    for (const [index, delta] of [100, 200, 300].entries()) {
      generation = recordTurnGrowth(generation, {
        conversationKey: `chat-${index}`,
        generationId: 'g1',
        beforeLoad: 1_000,
        afterLoad: 1_000 + delta,
        delta,
        uncertain: false,
        uncertaintySources: [],
        observedAt: 10 + index
      })
    }
    generation = recordTurnGrowth(generation, {
      conversationKey: 'tool-chat',
      generationId: 'g1',
      beforeLoad: 1_000,
      afterLoad: 11_000,
      delta: 10_000,
      uncertain: true,
      uncertaintySources: ['tool_result'],
      observedAt: 20
    })

    const summary = summarizeGeneration(generation)
    expect(summary.growthReserveReady).toBe(true)
    expect(summary.growthReserve).toBe(300)
  })

  it('does not call the growth reserve ready before enough whole turns exist', () => {
    let generation = createGeneration('g1', 1)
    generation = recordTurnGrowth(generation, {
      conversationKey: 'one',
      generationId: 'g1',
      beforeLoad: 100,
      afterLoad: 500,
      delta: 400,
      uncertain: false,
      uncertaintySources: [],
      observedAt: 2
    })

    expect(summarizeGeneration(generation).growthReserveReady).toBe(false)
  })

  it('starts a new generation with stale prior evidence but no inherited growth distribution', () => {
    let previous = createGeneration('old', 1)
    previous = recordConfirmedFailureReference(previous, {
      conversationKey: 'old-limit',
      generationId: 'old',
      estimatedLoad: 70_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })
    previous = recordTurnGrowth(previous, {
      conversationKey: 'old-growth',
      generationId: 'old',
      beforeLoad: 10_000,
      afterLoad: 12_000,
      delta: 2_000,
      uncertain: false,
      uncertaintySources: [],
      observedAt: 3
    })

    const next = createGeneration('new', 4, previous)
    expect(next.warmStartPrior?.failureReference).toEqual({
      load: 70_000,
      quality: 'strong'
    })
    expect(next.turnGrowthSamples).toEqual([])
    expect(summarizeGeneration(next).failureReference).toBeUndefined()
  })

  it('never lets non-length errors create pending or failure evidence', () => {
    let generation = createGeneration('g1', 1)
    generation = recordFailureObservation(generation, {
      conversationKey: 'network',
      generationId: 'g1',
      estimatedLoad: 1_000,
      errorKind: 'network_error',
      confidence: 'high',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    expect(generation.pendingFailureConfirmations).toEqual([])
    expect(summarizeGeneration(generation).failureReference).toBeUndefined()
  })

  it('prefers strong references over lower conservative references', () => {
    let generation = createGeneration('g1', 1)
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'conservative',
      generationId: 'g1',
      estimatedLoad: 45_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: ['attachment'],
      environmentSignature: env,
      observedAt: 2
    })
    generation = recordConfirmedFailureReference(generation, {
      conversationKey: 'strong',
      generationId: 'g1',
      estimatedLoad: 60_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 3
    })

    const summary = summarizeGeneration(generation)
    expect(summary.failureReference?.quality).toBe('strong')
    expect(summary.failureReference?.load).toBe(60_000)
  })
})
