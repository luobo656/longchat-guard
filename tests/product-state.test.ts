import { describe, expect, it } from 'vitest'
import {
  createGeneration,
  recordConfirmedFailureReference,
  recordSuccessfulAssistantCompletion
} from '../src/core/calibration'
import {
  compareEnvironmentSignatures,
  deriveCalibrationState,
  deriveEnvironmentConfidence,
  deriveMeasurementState,
  environmentSignaturesMatch
} from '../src/core/product-state'
import type { PersistedConversationLedger } from '../src/core/types'

const env = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v2',
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

  it('makes calibration stale only after a confirmed environment mismatch', () => {
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
          modelHint: 'different-model'
        }
      })
    ).toBe('stale')
  })

  it('distinguishes transient unknown environment from confirmed mismatch and recovers automatically', () => {
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
          parserSchemaVersion: env.parserSchemaVersion,
          measurementSchemaVersion: env.measurementSchemaVersion
        }
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
        currentEnvironment: { ...env, modelHint: 'different-model' }
      })
    ).toBe('stale')
  })

  it('keeps a calibration conservative when the model was not observable at calibration time', () => {
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
    ).toBe('calibrated_conservative')
    expect(
      deriveEnvironmentConfidence(
        generation.environmentSignature,
        envWithoutModel
      )
    ).toBe('unverified')
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('calibrated_conservative')
    expect(
      deriveEnvironmentConfidence(generation.environmentSignature, env)
    ).toBe('unverified')
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

  it('compares environment signatures as match, model-unverified, unknown or mismatch', () => {
    expect(compareEnvironmentSignatures(env, env)).toBe('match')
    expect(environmentSignaturesMatch(env, env)).toBe(true)
    expect(deriveEnvironmentConfidence(env, env)).toBe('verified')
    expect(compareEnvironmentSignatures(undefined, env)).toBe('unknown')
    expect(deriveEnvironmentConfidence(undefined, env)).toBe('unverified')
    expect(environmentSignaturesMatch(undefined, env)).toBe(false)
    expect(
      compareEnvironmentSignatures(envWithoutModel, envWithoutModel)
    ).toBe('model_unverified')
    expect(
      environmentSignaturesMatch(envWithoutModel, envWithoutModel)
    ).toBe(false)
    expect(
      compareEnvironmentSignatures(
        { ...env, modelHint: 'GPT A' },
        {
          parserSchemaVersion: env.parserSchemaVersion,
          measurementSchemaVersion: env.measurementSchemaVersion
        }
      )
    ).toBe('unknown')
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
    ).toBe(false)
    expect(
      environmentSignaturesMatch(
        env,
        { ...env, modelHint: 'GPT A' }
      )
    ).toBe(false)
    expect(
      environmentSignaturesMatch(
        { ...env, modelHint: 'GPT A' },
        { ...env, modelHint: 'GPT B' }
      )
    ).toBe(false)
  })
})
