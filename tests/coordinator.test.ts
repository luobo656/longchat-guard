import { describe, expect, it } from 'vitest'
import { StorageMutationCoordinator } from '../src/background/coordinator'
import { summarizeGeneration } from '../src/core/calibration'
import { anonymizeConversationKey } from '../src/core/fingerprinter'
import {
  deriveCalibrationState,
  deriveMeasurementState
} from '../src/core/product-state'
import type { LocalStorageArea } from '../src/core/storage'

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

function message(
  id: string,
  role: 'user' | 'assistant',
  tokenEstimate: number,
  observedAt = 1
) {
  return {
    contentFingerprint: id,
    stableHintHash: id,
    role,
    tokenEstimate,
    charCount: tokenEstimate * 4,
    observedAt
  }
}

async function observe(
  coordinator: StorageMutationCoordinator,
  input: {
    conversationKey: string
    baseRevision: number
    observationEpoch: number
    tokens: number
    composer?: number
    uncertaintySources?: Array<'attachment' | 'tool_result'>
  }
) {
  const state = await coordinator.loadState()
  const result = await coordinator.observeWindow({
    conversationKey: input.conversationKey,
    coverageState: 'complete',
    parserHealth: 'healthy',
    tailEvidence: 'at_tail',
    observedMessages: [
      message(
        'stable-main',
        'user',
        input.tokens,
        input.observationEpoch
      )
    ],
    composerTokenEstimate: input.composer ?? 0,
    environmentSignature: env,
    uncertaintySources: input.uncertaintySources ?? [],
    expectedGenerationId: state.settings.generationId,
    baseRevision: input.baseRevision,
    observationEpoch: input.observationEpoch,
    observedAt: input.observationEpoch
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

describe('storage mutation coordinator state transitions', () => {
  it('rejects an old tab observation instead of overwriting a newer ledger', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )

    const first = await observe(coordinator, {
      conversationKey: 'chatgpt:same',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 100
    })
    expect(first.snapshot.ledgerRevision).toBe(1)

    const second = await observe(coordinator, {
      conversationKey: 'chatgpt:same',
      baseRevision: 1,
      observationEpoch: 20,
      tokens: 200
    })
    expect(second.snapshot.ledgerRevision).toBe(2)
    expect(second.snapshot.currentEstimatedLoad).toBe(200)

    const stale = await observe(coordinator, {
      conversationKey: 'chatgpt:same',
      baseRevision: 1,
      observationEpoch: 15,
      tokens: 50
    })

    expect(stale.staleObservation).toBe(true)
    expect(stale.observationDisposition).toBe('stale')
    expect(stale.snapshot.ledgerRevision).toBe(2)
    expect(stale.snapshot.currentEstimatedLoad).toBe(200)
  })

  it('does not downgrade a trusted complete ledger from a weaker passive observation', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const first = await observe(coordinator, {
      conversationKey: 'chatgpt:trusted-passive',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 1_000
    })
    const revision = first.snapshot.ledgerRevision

    const incomplete = await coordinator.observeWindow({
      conversationKey: 'chatgpt:trusted-passive',
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      tailEvidence: 'unknown',
      observedMessages: [
        message('stable-main', 'user', 1_000, 20)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: first.state.settings.generationId,
      baseRevision: revision,
      observationEpoch: 20,
      observedAt: 20
    })
    expect(incomplete.observationDisposition).toBe('retained_authoritative')
    expect(incomplete.snapshot?.coverageState).toBe('complete')
    expect(incomplete.snapshot?.parserHealth).toBe('healthy')
    expect(incomplete.snapshot?.sequenceReliability).toBe('reliable')
    expect(incomplete.snapshot?.ledgerRevision).toBe(revision)
    expect(incomplete.snapshot?.currentEstimatedLoad).toBe(1_000)

    const degraded = await coordinator.observeWindow({
      conversationKey: 'chatgpt:trusted-passive',
      coverageState: 'complete',
      parserHealth: 'degraded',
      tailEvidence: 'unknown',
      observedMessages: [
        message('stable-main', 'user', 1_000, 30)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: first.state.settings.generationId,
      baseRevision: revision,
      observationEpoch: 30,
      observedAt: 30
    })
    expect(degraded.observationDisposition).toBe('retained_authoritative')
    if (!degraded.snapshot) throw new Error('expected_degraded_snapshot')
    expect(degraded.snapshot.coverageState).toBe('complete')
    expect(degraded.snapshot.parserHealth).toBe('healthy')
    expect(degraded.snapshot.sequenceReliability).toBe('reliable')
    expect(degraded.snapshot.ledgerRevision).toBe(revision)
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: degraded.snapshot
      })
    ).toBe('complete')

    const changedWhileWeak = await coordinator.observeWindow({
      conversationKey: 'chatgpt:trusted-passive',
      coverageState: 'incomplete',
      parserHealth: 'degraded',
      tailEvidence: 'unknown',
      observedMessages: [
        message('stable-main', 'user', 1_000, 40),
        message('new-user-while-weak', 'user', 100, 40)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: first.state.settings.generationId,
      baseRevision: revision,
      observationEpoch: 40,
      observedAt: 40
    })
    expect(changedWhileWeak.observationDisposition).toBe(
      'retained_authoritative'
    )
    if (!changedWhileWeak.snapshot) {
      throw new Error('expected_changed_while_weak_snapshot')
    }
    expect(changedWhileWeak.snapshot.ledgerRevision).toBe(revision)
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: changedWhileWeak.snapshot
      })
    ).toBe('complete')

    const recovered = await coordinator.observeWindow({
      conversationKey: 'chatgpt:trusted-passive',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        message('stable-main', 'user', 1_000, 50),
        message('new-user-while-weak', 'user', 100, 50)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: first.state.settings.generationId,
      baseRevision: revision,
      observationEpoch: 50,
      observedAt: 50
    })
    expect(recovered.observationDisposition).toBe('committed')
    if (!recovered.snapshot) throw new Error('expected_recovered_snapshot')
    expect(recovered.snapshot.ledgerRevision).toBeGreaterThan(revision)
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: recovered.snapshot
      })
    ).toBe('complete')
  })

  it('rejects stale observation, completion, and failure events from an old generation', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const first = await observe(coordinator, {
      conversationKey: 'chatgpt:generation-race',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 1_000
    })
    const oldGenerationId = first.state.settings.generationId
    const oldRevision = first.snapshot.ledgerRevision

    const reset = await coordinator.startGeneration(
      'recalibrate',
      20
    )
    const newGenerationId = reset.settings.generationId
    expect(newGenerationId).not.toBe(oldGenerationId)

    const staleObservation = await coordinator.observeWindow({
      conversationKey: 'chatgpt:generation-race',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        message('stale-user', 'user', 2_000, 21)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: oldGenerationId,
      baseRevision: oldRevision,
      observationEpoch: 21,
      observedAt: 21
    })
    expect(staleObservation.staleObservation).toBe(true)

    await coordinator.recordCompletion({
      conversationKey: 'chatgpt:generation-race',
      assistantFingerprint: 'stale-assistant',
      beforeTurnLoad: 500,
      expectedGenerationId: oldGenerationId,
      expectedLedgerRevision: oldRevision,
      observedAt: 22
    })
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:generation-race',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      expectedGenerationId: oldGenerationId,
      expectedLedgerRevision: oldRevision,
      observedAt: 23
    })

    const final = await coordinator.loadState()
    const generation = final.generations[0]!
    expect(final.settings.generationId).toBe(newGenerationId)
    expect(generation.samples).toEqual([])
    expect(generation.turnGrowthSamples).toEqual([])
    expect(generation.pendingFailureConfirmations).toEqual([])
  })

  it('explicit calibration creates a usable reference in one atomic commit without pending confirmation', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()

    const result = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:known-limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-1',
      environmentSignature: env,
      uncertaintySources: [],
      observedMessages: [
        message('u1', 'user', 20_000),
        message('a1', 'assistant', 40_000)
      ],
      observedAt: 10
    })

    const generation = result.state.generations[0]!
    const summary = summarizeGeneration(generation)
    expect(summary.failureReference).toEqual({
      load: 60_000,
      quality: 'strong',
      sourceConversationCount: 1
    })
    expect(generation.pendingFailureConfirmations).toEqual([])
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('calibrated')
  })

  it('explicit attachment calibration becomes conservative but usable', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()

    const result = await coordinator.commitCalibration({
      conversationKey: 'chatgpt:attachment-limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-attachment',
      environmentSignature: env,
      uncertaintySources: ['attachment'],
      observedMessages: [
        {
          ...message('u1', 'user', 25_000),
          attachmentCount: 1
        },
        message('a1', 'assistant', 25_000)
      ],
      observedAt: 10
    })

    const generation = result.state.generations[0]!
    expect(
      summarizeGeneration(generation).failureReference?.quality
    ).toBe('conservative')
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('calibrated_conservative')
  })

  it('passive length detection creates pending confirmation but no usable failure reference', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const observed = await observe(coordinator, {
      conversationKey: 'chatgpt:passive',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 5_000
    })

    const result = await coordinator.recordFailure({
      conversationKey: 'chatgpt:passive',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      expectedGenerationId: observed.state.settings.generationId,
      expectedLedgerRevision: observed.snapshot.ledgerRevision,
      observedAt: 11
    })

    const generation = result.state.generations[0]!
    expect(generation.pendingFailureConfirmations).toHaveLength(1)
    expect(summarizeGeneration(generation).failureReference).toBeUndefined()
    expect(
      deriveMeasurementState({
        supported: true,
        ledger: observed.snapshot
      })
    ).toBe('complete')
  })

  it('accepting a passive confirmation creates the reference and does not re-prompt the same error', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const observed = await observe(coordinator, {
      conversationKey: 'chatgpt:passive',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 5_000
    })
    await coordinator.recordFailure({
      conversationKey: 'chatgpt:passive',
      errorKind: 'conversation_length_limit',
      confidence: 'medium',
      composerTokenEstimate: 0,
      expectedGenerationId: observed.state.settings.generationId,
      expectedLedgerRevision: observed.snapshot.ledgerRevision,
      observedAt: 11
    })
    const accepted = await coordinator.confirmPendingFailure(
      'chatgpt:passive',
      true,
      12
    )

    expect(
      summarizeGeneration(accepted.state.generations[0]!)
        .failureReference?.load
    ).toBe(5_000)

    const repeated = await coordinator.recordFailure({
      conversationKey: 'chatgpt:passive',
      errorKind: 'conversation_length_limit',
      confidence: 'high',
      composerTokenEstimate: 0,
      expectedGenerationId: observed.state.settings.generationId,
      expectedLedgerRevision: observed.snapshot.ledgerRevision,
      observedAt: 13
    })
    expect(
      repeated.state.generations[0]?.pendingFailureConfirmations
    ).toEqual([])
  })

  it('composer text can make projected risk high before send', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    await coordinator.commitCalibration({
      conversationKey: 'chatgpt:limit',
      expectedGenerationId: initial.settings.generationId,
      expectedLedgerRevision: 0,
      scanSessionId: 'scan-limit',
      environmentSignature: env,
      uncertaintySources: [],
      observedMessages: [
        message('lu', 'user', 50_000),
        message('la', 'assistant', 50_000)
      ],
      observedAt: 10
    })

    const before = await observe(coordinator, {
      conversationKey: 'chatgpt:current',
      baseRevision: 0,
      observationEpoch: 20,
      tokens: 90_000,
      composer: 0
    })
    expect(before.risk.state).toBe('normal')

    const withDraft = await observe(coordinator, {
      conversationKey: 'chatgpt:current',
      baseRevision: before.snapshot.ledgerRevision,
      observationEpoch: 21,
      tokens: 90_000,
      composer: 10_001
    })
    expect(withDraft.risk.state).toBe('high')
    expect(withDraft.snapshot.ledgerRevision).toBe(
      before.snapshot.ledgerRevision
    )
    expect(withDraft.risk.reasons).toContain(
      'composer_draft_included'
    )
  })

  it('records whole-turn growth from before-send load to completed load', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const first = await observe(coordinator, {
      conversationKey: 'chatgpt:growth',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 1_000
    })
    const second = await coordinator.observeWindow({
      conversationKey: 'chatgpt:growth',
      coverageState: 'complete',
      parserHealth: 'healthy',
      tailEvidence: 'at_tail',
      observedMessages: [
        message('stable-main', 'user', 1_000, 11),
        message('a1', 'assistant', 2_000, 11)
      ],
      composerTokenEstimate: 0,
      environmentSignature: env,
      uncertaintySources: [],
      expectedGenerationId: first.state.settings.generationId,
      baseRevision: first.snapshot.ledgerRevision,
      observationEpoch: 11,
      observedAt: 11
    })
    if (!second.snapshot) throw new Error('expected_second_snapshot')

    await coordinator.recordCompletion({
      conversationKey: 'chatgpt:growth',
      assistantFingerprint: second.snapshot.activeFingerprints.at(-1)!,
      beforeTurnLoad: 1_000,
      expectedGenerationId: second.state.settings.generationId,
      expectedLedgerRevision: second.snapshot.ledgerRevision,
      observedAt: 12
    })

    const state = await coordinator.loadState()
    expect(state.generations[0]?.turnGrowthSamples[0]?.delta).toBe(
      2_000
    )
  })

  it('persists mute controls under the pseudonymous conversation key', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const initial = await coordinator.loadState()
    const updated = await coordinator.updateControl(
      'chatgpt:mute-me',
      { muted: true }
    )
    const key = await anonymizeConversationKey(
      'chatgpt:mute-me',
      initial.installSalt
    )

    expect(updated.conversationControls[key]).toMatchObject({
      muted: true
    })
    expect(updated.conversationControls['chatgpt:mute-me']).toBeUndefined()

    const reloaded = await coordinator.loadState()
    expect(reloaded.conversationControls[key]?.muted).toBe(true)
  })

  it('stores only pseudonymous conversation keys', async () => {
    const coordinator = new StorageMutationCoordinator(
      new MemoryStorage()
    )
    const state = await coordinator.loadState()
    await observe(coordinator, {
      conversationKey: 'chatgpt:private-id',
      baseRevision: 0,
      observationEpoch: 10,
      tokens: 100
    })
    const reloaded = await coordinator.loadState()
    const key = await anonymizeConversationKey(
      'chatgpt:private-id',
      state.installSalt
    )
    expect(reloaded.ledgers[key]).toBeDefined()
    expect(JSON.stringify(reloaded)).not.toContain(
      'chatgpt:private-id'
    )
  })
})