import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordConfirmedFailureReference,
  recordSuccessfulAssistantCompletion
} from '../src/core/calibration'
import {
  calibrationNeedsFreshGeneration,
  compareEnvironmentSignatures,
  deriveCalibrationState,
  deriveEnvironmentConfidence,
  deriveMeasurementState,
  environmentSignaturesMatch
} from '../src/core/product-state'
import type { PersistedConversationLedger } from '../src/core/types'

const env = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
  measurementSchemaVersion: 2,
  modelHint: 'GPT Fixture'
} as const

const envWithoutModel = {
  parserSchemaVersion: env.parserSchemaVersion,
  measurementSchemaVersion: env.measurementSchemaVersion
} as const

function ledger(
  overrides: Partial<PersistedConversationLedger> = {}
): PersistedConversationLedger {
  return {
    conversationKey: 'lcg:test',
    generationId: 'g1',
    ledgerRevision: 1,
    observationEpoch: 1,
    coverageState: 'complete',
    parserHealth: 'healthy',
    messages: [],
    activeFingerprints: [],
    sequenceReliability: 'reliable',
    currentEstimatedLoad: 1_000,
    uncertaintySources: [],
    environmentSignature: env,
    completedAssistantFingerprints: [],
    confirmedFailureFingerprints: [],
    dismissedFailureKeys: [],
    updatedAt: 1,
    ...overrides
  }
}

describe('unified product state', () => {
  it('does not treat safe-only evidence as calibrated', () => {
    let generation = createGeneration('g1', 1)
    generation = recordSuccessfulAssistantCompletion(generation, {
      conversationKey: 'safe',
      generationId: 'g1',
      estimatedLoad: 50_000,
      assistantFingerprint: 'assistant',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('uncalibrated')
  })

  it('recognizes strong and conservative current failure references', () => {
    let strong = createGeneration('strong', 1)
    strong = recordConfirmedFailureReference(strong, {
      conversationKey: 'limit',
      generationId: 'strong',
      estimatedLoad: 60_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })
    expect(
      deriveCalibrationState({
        generation: strong,
        currentEnvironment: env
      })
    ).toBe('calibrated')

    let conservative = createGeneration('conservative', 1)
    conservative = recordConfirmedFailureReference(conservative, {
      conversationKey: 'limit-file',
      generationId: 'conservative',
      estimatedLoad: 50_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: ['attachment'],
      environmentSignature: env,
      observedAt: 2
    })
    expect(
      deriveCalibrationState({
        generation: conservative,
        currentEnvironment: env
      })
    ).toBe('calibrated_conservative')
  })

  it('makes calibration stale after a parser-schema mismatch', () => {
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

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: {
          ...env,
          parserSchemaVersion: 'different-parser'
        }
      })
    ).toBe('stale')
  })

  it('requires a fresh generation before recalibrating a usable reference after parser-schema drift', () => {
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
      environmentSignature: {
        ...env,
        parserSchemaVersion: 'chatgpt-dom-2026-10-v2'
      },
      observedAt: 2
    })

    expect(
      calibrationNeedsFreshGeneration({
        generation,
        currentEnvironment: env
      })
    ).toBe(true)
  })

  it('treats model labels as diagnostics while keeping missing signatures fail-closed', () => {
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

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: undefined
      })
    ).toBe('environment_unknown')

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('calibrated')

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: envWithoutModel
      })
    ).toBe('calibrated')
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: { ...env, modelHint: 'different-model' }
      })
    ).toBe('calibrated')
  })

  it('keeps a complete calibration strong when the model label was not observable', () => {
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
      environmentSignature: envWithoutModel,
      observedAt: 2
    })

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: envWithoutModel
      })
    ).toBe('calibrated')
    expect(
      deriveEnvironmentConfidence(
        generation.environmentSignature,
        envWithoutModel
      )
    ).toBe('verified')
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('calibrated')
    expect(
      deriveEnvironmentConfidence(generation.environmentSignature, env)
    ).toBe('verified')
  })

  it('treats a warm-start prior as stale, never current calibration', () => {
    let old = createGeneration('old', 1)
    old = recordConfirmedFailureReference(old, {
      conversationKey: 'old-limit',
      generationId: 'old',
      estimatedLoad: 60_000,
      errorKind: 'conversation_length_limit',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      observedAt: 2
    })
    const fresh = createGeneration('fresh', 3, old)

    expect(
      deriveCalibrationState({
        generation: fresh,
        currentEnvironment: env
      })
    ).toBe('stale')
  })

  it('requires complete, healthy and reliable measurement for risk use', () => {
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: ledger()
      })
    ).toBe('complete')
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: ledger({ coverageState: 'incomplete' })
      })
    ).toBe('partial')
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: ledger({ parserHealth: 'degraded' })
      })
    ).toBe('uncertain')
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: ledger({ sequenceReliability: 'uncertain' })
      })
    ).toBe('uncertain')
    expect(
      deriveMeasurementState({ supported: true })
    ).toBe('unavailable')
  })

  it('compares only parser and measurement schemas; model labels are diagnostic-only', () => {
    expect(compareEnvironmentSignatures(env, env)).toBe('match')
    expect(environmentSignaturesMatch(env, env)).toBe(true)
    expect(deriveEnvironmentConfidence(env, env)).toBe('verified')
    expect(compareEnvironmentSignatures(undefined, env)).toBe('unknown')
    expect(deriveEnvironmentConfidence(undefined, env)).toBe('unverified')
    expect(environmentSignaturesMatch(undefined, env)).toBe(false)
    expect(
      compareEnvironmentSignatures(envWithoutModel, envWithoutModel)
    ).toBe('match')
    expect(
      environmentSignaturesMatch(envWithoutModel, envWithoutModel)
    ).toBe(true)
    expect(
      compareEnvironmentSignatures(
        { ...env, modelHint: 'GPT A' },
        {
          parserSchemaVersion: env.parserSchemaVersion,
          measurementSchemaVersion: env.measurementSchemaVersion
        }
      )
    ).toBe('match')
    expect(
      compareEnvironmentSignatures(
        env,
        { ...env, parserSchemaVersion: 'different-parser' }
      )
    ).toBe('mismatch')
    expect(
      deriveEnvironmentConfidence(
        env,
        { ...env, parserSchemaVersion: 'different-parser' }
      )
    ).toBe('mismatch')
    expect(
      environmentSignaturesMatch(
        { ...env, modelHint: 'GPT A' },
        env
      )
    ).toBe(true)
    expect(
      environmentSignaturesMatch(
        env,
        { ...env, modelHint: 'GPT A' }
      )
    ).toBe(true)
    expect(
      environmentSignaturesMatch(
        { ...env, modelHint: 'GPT A' },
        { ...env, modelHint: 'GPT B' }
      )
    ).toBe(true)
  })
})
