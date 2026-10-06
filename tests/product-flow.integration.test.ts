import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import { summarizeGeneration } from '../src/core/calibration'
import {
  calibrationNeedsFreshGeneration,
  deriveCalibrationState,
  deriveMeasurementState
} from '../src/core/product-state'
import type { LocalStorageArea } from '../src/core/storage'
import { shouldRenderRiskTrack } from '../src/content/ui'

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
  parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
  measurementSchemaVersion: 2,
  modelHint: 'GPT Fixture'
} as const

const envWithoutModel = {
  parserSchemaVersion: env.parserSchemaVersion,
  measurementSchemaVersion: env.measurementSchemaVersion
} as const

const previousParserEnv = {
  ...env,
  parserSchemaVersion: 'chatgpt-dom-2026-10-v2'
} as const

function observed(
  id: string,
  role: 'user' | 'assistant',
  tokens: number,
  at: number
) {
  return {
    contentFingerprint: id,
    stableHintHash: id,
    role,
    tokenEstimate: tokens,
    charCount: tokens * 4,
    observedAt: at
  }
}

async function observeComplete(
  coordinator: StorageMutationCoordinator,
  conversationKey: string,
  baseRevision: number,
  at: number,
  tokens: number,
  composerTokenEstimate = 0
) {
  const state = await coordinator.loadState()
  const result = await coordinator.observeWindow({
    conversationKey,
    coverageState: 'complete',
    parserHealth: 'healthy',
    tailEvidence: 'at_tail',
    observedMessages: [
      observed('stable-user', 'user', tokens, at)
    ],
    composerTokenEstimate,
    environmentSignature: env,
    uncertaintySources: [],
    expectedGenerationId: state.settings.generationId,
    baseRevision,
    observationEpoch: at,
    observedAt: at
  })
  if (!result.snapshot || !result.risk) {
    throw new Error('expected_observation_result')
  }
  return {
    ...result,
    snapshot: result.snapshot,
    risk: result.risk
  }
}

async function calibrateStrong(
  coordinator: StorageMutationCoordinator,
  conversationKey = 'chatgpt:limit',
  expectedLedgerRevision = 0
) {
  const state = await coordinator.loadState()
  return coordinator.commitCalibration({
    conversationKey,
    expectedGenerationId: state.settings.generationId,
    expectedLedgerRevision,
    scanSessionId: `scan-${conversationKey}`,
    environmentSignature: env,
    uncertaintySources: [],
    observedMessages: [
      observed('limit-user', 'user', 20_000, 10),
      observed('limit-assistant', 'assistant', 40_000, 10)
    ],
    observedAt: 11
  })
}

describe('product-flow integration matrix', () => {
  it('first run and no calibration stay unknown with no full risk track', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const state = await coordinator.loadState()
    const generation = state.generations[0]!

    const calibrationState = deriveCalibrationState({
      generation,
      currentEnvironment: env
    })

    expect(calibrationState).toBe('uncalibrated')
    expect(
      shouldRenderRiskTrack({
        measurementState: 'unavailable',
        calibrationState,
        riskState: 'unknown',
        environmentConfidence: 'verified',
        referencePositionScore: 0,
        trackAvailable: false,
        growthReserveReady: false,
        muted: false,
        pendingFailureConfirmation: false,
        uncertaintySources: []
      })
    ).toBe(false)
  })

  it('safe-only evidence remains uncalibrated and unknown', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const observedPage = await observeComplete(
      coordinator,
      'chatgpt:safe',
      0,
      10,
      5_000
    )

    const completed = await coordinator.recordCompletion({
      conversationKey: 'chatgpt:safe',
      assistantFingerprint:
        observedPage.snapshot.activeFingerprints[0]!,
      beforeTurnLoad: 1_000,
      expectedGenerationId: observedPage.state.settings.generationId,
      expectedLedgerRevision:
        observedPage.snapshot.ledgerRevision,
      observedAt: 11
    })

    const generation = completed.state.generations[0]!
    expect(summarizeGeneration(generation).safeEvidenceLoad).toBe(
      5_000
    )
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('uncalibrated')
    expect(completed.risk?.state).toBe('unknown')
  })

  it('one explicit calibration establishes strong reference and high risk at L == R', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const result = await calibrateStrong(coordinator)
    const generation = result.state.generations[0]!
    const measurementState = deriveMeasurementState({
      supported: true,
      ledger: result.snapshot
    })
    const calibrationState = deriveCalibrationState({
      generation,
      currentEnvironment: env
    })

    expect(measurementState).toBe('complete')
    expect(calibrationState).toBe('calibrated')
    expect(result.risk.state).toBe('high')
    expect(
      shouldRenderRiskTrack({
        conversationKey: result.snapshot.conversationKey,
        measurementState,
        calibrationState,
        riskState: result.risk.state,
        environmentConfidence: 'verified',
        referencePositionScore: result.risk.referencePositionScore,
        trackAvailable: true,
        growthReserveReady: false,
        muted: false,
        pendingFailureConfirmation: false,
        uncertaintySources: []
      })
    ).toBe(true)
    expect(generation.pendingFailureConfirmations).toEqual([])
  })

  it('recovers a historical chat measurement without changing the alert reference', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const calibrated = await calibrateStrong(coordinator)
    const beforeGeneration = calibrated.state.generations[0]!
    const beforeSummary = summarizeGeneration(beforeGeneration)

    const partial = await coordinator.observeWindow({
      conversationKey: 'chatgpt:old-history',
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        observed('old-visible-user', 'user', 2_000, 20)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: calibrated.state.settings.generationId,
      baseRevision: 0,
      observationEpoch: 20,
      observedAt: 20
    })
    expect(partial.snapshot?.coverageState).toBe('incomplete')

    const recovered = await coordinator.commitMeasurementScan({
      conversationKey: 'chatgpt:old-history',
      expectedGenerationId: calibrated.state.settings.generationId,
      expectedLedgerRevision: partial.snapshot!.ledgerRevision,
      environmentSignature: env,
      uncertaintySources: [],
      observedMessages: [
        observed('old-user-1', 'user', 4_000, 30),
        observed('old-assistant-1', 'assistant', 6_000, 30),
        observed('old-user-2', 'user', 3_000, 30)
      ],
      observedAt: 31
    })

    const afterGeneration = recovered.state.generations[0]!
    const afterSummary = summarizeGeneration(afterGeneration)
    expect(recovered.snapshot.coverageState).toBe('complete')
    expect(recovered.snapshot.sequenceReliability).toBe('reliable')
    expect(recovered.snapshot.currentEstimatedLoad).toBe(13_000)
    expect(recovered.risk.state).toBe('normal')
    expect(afterSummary.failureReference).toEqual(beforeSummary.failureReference)
    expect(afterGeneration.samples).toEqual(beforeGeneration.samples)
  })

  it('attachment calibration is conservative, usable and still renders risk track', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const state = await coordinator.loadState()
    const result = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:attachment-limit',
      expectedGenerationId: state.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-attachment',
      environmentSignature: env,
      uncertaintySources: ['attachment'],
      observedMessages: [
        {
          ...observed('u', 'user', 30_000, 10),
          attachmentCount: 1
        },
        observed('a', 'assistant', 30_000, 10)
      ],
      observedAt: 11
    })

    const generation = result.state.generations[0]!
    const calibrationState = deriveCalibrationState({
      generation,
      currentEnvironment: env
    })
    expect(calibrationState).toBe(
      'calibrated_conservative'
    )
    expect(
      summarizeGeneration(generation).failureReference?.quality
    ).toBe('conservative')
  })

  it('treats missing model labels as diagnostics and keeps the calibrated reference strong', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    const calibrated = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:no-model-label-limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-no-model-label',
      environmentSignature: envWithoutModel,
      uncertaintySources: [],
      observedMessages: [
        observed('limit-u', 'user', 50_000, 10),
        observed('limit-a', 'assistant', 50_000, 10)
      ],
      observedAt: 11
    })

    const generation = calibrated.state.generations[0]!
    expect(summarizeGeneration(generation).failureReference).toEqual({
      load: 100_000,
      quality: 'strong',
      sourceConversationCount: 1
    })
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: envWithoutModel
      })
    ).toBe('calibrated')
    expect(calibrated.risk.state).toBe('high')
    expect(calibrated.risk.referencePositionScore).toBe(100)

    const low = await coordinator.observeWindow({
      conversationKey: 'chatgpt:no-model-label-low',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [observed('low-u', 'user', 20_000, 20)],
      composerTokenEstimate: 0,
      environmentSignature: envWithoutModel,
      uncertaintySources: [],
      expectedGenerationId: initial.settings.generationId,
      baseRevision: 0,
      observationEpoch: 20,
      observedAt: 20
    })
    expect(low.risk?.state).toBe('normal')
    expect(low.risk?.referencePositionScore).toBeGreaterThan(0)
  })

  it('schema mismatch and generation reset both remove eligibility for normal risk', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const calibrated = await calibrateStrong(coordinator)
    const generation = calibrated.state.generations[0]!

    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: previousParserEnv
      })
    ).toBe('stale')

    const reset = await coordinator.startGeneration(
      'recalibrate',
      20
    )
    const next = reset.generations[0]!
    expect(next.warmStartPrior?.failureReference).toBeDefined()
    expect(
      deriveCalibrationState({
        generation: next,
        currentEnvironment: env
      })
    ).toBe('stale')
    expect(next.turnGrowthSamples).toEqual([])
  })

  it('parser drift rotates to a clean generation before a replacement calibration is committed', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    const oldCalibration = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:old-parser-limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-old-parser',
      environmentSignature: previousParserEnv,
      uncertaintySources: [],
      observedMessages: [
        observed('old-limit-u', 'user', 20_000, 10),
        observed('old-limit-a', 'assistant', 40_000, 10)
      ],
      observedAt: 11
    })
    const oldGeneration = oldCalibration.state.generations[0]!

    expect(
      calibrationNeedsFreshGeneration({
        generation: oldGeneration,
        currentEnvironment: env
      })
    ).toBe(true)
    expect(
      deriveCalibrationState({
        generation: oldGeneration,
        currentEnvironment: env
      })
    ).toBe('stale')

    const rotated = await coordinator.startGeneration(
      'environment_change',
      20
    )
    const freshGeneration = rotated.generations[0]!
    expect(freshGeneration.id).not.toBe(oldGeneration.id)
    expect(freshGeneration.samples).toEqual([])
    expect(freshGeneration.turnGrowthSamples).toEqual([])
    expect(freshGeneration.warmStartPrior?.failureReference?.load).toBe(
      60_000
    )

    const recalibrated = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:new-parser-limit',
      expectedGenerationId: freshGeneration.id,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-new-parser',
      environmentSignature: env,
      uncertaintySources: [],
      observedMessages: [
        observed('new-limit-u', 'user', 22_000, 30),
        observed('new-limit-a', 'assistant', 43_000, 30)
      ],
      observedAt: 31
    })
    const current = recalibrated.state.generations[0]!

    expect(current.id).toBe(freshGeneration.id)
    expect(current.samples).toHaveLength(1)
    expect(current.turnGrowthSamples).toEqual([])
    expect(summarizeGeneration(current).failureReference?.load).toBe(65_000)
    expect(
      deriveCalibrationState({
        generation: current,
        currentEnvironment: env
      })
    ).toBe('calibrated')
  })

  it('reload preserves current calibration without upgrading evidence', async () => {
    const storage = new MemoryStorage()
    const coordinator = new StorageMutationCoordinator(storage)
    const calibrated = await calibrateStrong(coordinator)
    const before = calibrated.state.generations[0]!

    const afterReload = await coordinator.loadState()
    const after = afterReload.generations[0]!

    expect(
      summarizeGeneration(after).failureReference
    ).toEqual(summarizeGeneration(before).failureReference)
    expect(
      deriveCalibrationState({
        generation: after,
        currentEnvironment: env
      })
    ).toBe('calibrated')
  })

  it('scan transaction fails closed if the conversation ledger changes before commit', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    await observeComplete(
      coordinator,
      'chatgpt:changing',
      0,
      10,
      1_000
    )

    await expect(
      coordinator.commitCalibration({
        conversationKey: 'chatgpt:changing',
        expectedGenerationId: initial.settings.generationId,
        expectedLedgerRevision: 0,
        scanSessionId: 'stale-scan',
        environmentSignature: env,
        uncertaintySources: [],
        observedMessages: [
          observed('u', 'user', 1_000, 11),
          observed('a', 'assistant', 2_000, 11)
        ],
        observedAt: 12
      })
    ).rejects.toThrow('ledger_changed_during_scan')

    const state = await coordinator.loadState()
    expect(
      summarizeGeneration(state.generations[0]!)
        .failureReference
    ).toBeUndefined()
  })

  it('tool-context whole turns do not enter the learned reserve distribution', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    const first = await coordinator.observeWindow({
      conversationKey: 'chatgpt:tool',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        observed('u', 'user', 1_000, 10)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: ['tool_result'],
      expectedGenerationId: initial.settings.generationId,
      baseRevision: 0,
      observationEpoch: 10,
      observedAt: 10
    })
    if (!first.snapshot) throw new Error('expected_first_snapshot')
    const second = await coordinator.observeWindow({
      conversationKey: 'chatgpt:tool',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        observed('u', 'user', 1_000, 11),
        observed('a', 'assistant', 3_000, 11)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: ['tool_result'],
      expectedGenerationId: initial.settings.generationId,
      baseRevision: first.snapshot.ledgerRevision,
      observationEpoch: 11,
      observedAt: 11
    })
    if (!second.snapshot) throw new Error('expected_second_snapshot')

    await coordinator.recordCompletion({
      conversationKey: 'chatgpt:tool',
      assistantFingerprint:
        second.snapshot.activeFingerprints.at(-1)!,
      beforeTurnLoad: 1_000,
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision:
        second.snapshot.ledgerRevision,
      observedAt: 12
    })

    const state = await coordinator.loadState()
    const summary = summarizeGeneration(state.generations[0]!)
    expect(state.generations[0]?.turnGrowthSamples[0]?.uncertain)
      .toBe(true)
    expect(summary.growthReserveReady).toBe(false)
    expect(summary.growthReserve).toBe(0)
  })
})
