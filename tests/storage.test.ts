import { describe, expect, it } from 'vitest'
import {
  anonymizeConversationKey,
  isAnonymousConversationKey
} from '../src/core/fingerprinter'
import {
  CURRENT_SCHEMA_VERSION,
  hasDismissedPrivacyConsent,
  hasRequiredPrivacyConsent,
  loadState,
  mergeLedgerSnapshots,
  readState,
  saveState,
  type LocalStorageArea,
  withPrivacyConsent
} from '../src/core/storage'
import { deriveCalibrationState } from '../src/core/product-state'
import type {
  PersistedConversationLedger,
  UncertaintySource
} from '../src/core/types'

class MemoryStorage implements LocalStorageArea {
  private readonly values = new Map<string, unknown>()
  setCount = 0

  seed(key: string, value: unknown): void {
    this.values.set(key, value)
  }

  async get(
    keys?: string[] | Record<string, unknown> | string | null
  ): Promise<Record<string, unknown>> {
    if (typeof keys === 'string') {
      return { [keys]: this.values.get(keys) }
    }
    return Object.fromEntries(this.values)
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.setCount += 1
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

function ledger(input: {
  key: string
  revision: number
  epoch: number
  load: number
  fingerprints?: string[]
  uncertaintySources?: UncertaintySource[]
  completed?: string[]
  confirmed?: string[]
}): PersistedConversationLedger {
  const fingerprints = input.fingerprints ?? ['m1']
  return {
    conversationKey: input.key,
    generationId: 'g1',
    ledgerRevision: input.revision,
    observationEpoch: input.epoch,
    coverageState: 'complete',
    parserHealth: 'healthy',
    messages: fingerprints.map((fingerprint, index) => ({
      fingerprint,
      contentFingerprint: `content-${fingerprint}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      tokenEstimate: input.load / fingerprints.length,
      observedAt: input.epoch + index
    })),
    activeFingerprints: fingerprints,
    sequenceReliability: 'reliable',
    currentEstimatedLoad: input.load,
    uncertaintySources: input.uncertaintySources ?? [],
    environmentSignature: env,
    completedAssistantFingerprints: input.completed ?? [],
    confirmedFailureFingerprints: input.confirmed ?? [],
    dismissedFailureKeys: [],
    updatedAt: input.epoch
  }
}

describe('chrome local storage persistence model', () => {
  it('initializes durable pseudonymous state and restores it after restart', async () => {
    const storage = new MemoryStorage()
    const first = await loadState(storage)
    const second = await loadState(storage)

    expect(first.installSalt).toBeTruthy()
    expect(second.installSalt).toBe(first.installSalt)
    expect(second.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(second.generations).toHaveLength(1)
  })

  it('uses latest-only measurement fields while unioning durable evidence', () => {
    const newer = ledger({
      key: 'lcg:key',
      revision: 5,
      epoch: 50,
      load: 5_000,
      fingerprints: ['new'],
      uncertaintySources: [],
      completed: ['done-new']
    })
    const older = ledger({
      key: 'lcg:key',
      revision: 4,
      epoch: 40,
      load: 1_000,
      fingerprints: ['old'],
      uncertaintySources: ['attachment'],
      confirmed: ['failure-old']
    })

    const merged = mergeLedgerSnapshots(newer, older)
    expect(merged.currentEstimatedLoad).toBe(5_000)
    expect(merged.activeFingerprints).toEqual(['new'])
    expect(merged.uncertaintySources).toEqual([])
    expect(merged.completedAssistantFingerprints).toEqual([
      'done-new'
    ])
    expect(merged.confirmedFailureFingerprints).toEqual([
      'failure-old'
    ])
    expect(merged.messages.map((message) => message.fingerprint).sort())
      .toEqual(['new', 'old'])
  })

  it('never carries generation-scoped completion or failure evidence into a new generation ledger', () => {
    const oldGeneration = {
      ...ledger({
        key: 'lcg:key',
        revision: 9,
        epoch: 90,
        load: 9_000,
        completed: ['old-completion'],
        confirmed: ['old-failure']
      }),
      generationId: 'g1'
    }
    const newGeneration = {
      ...ledger({
        key: 'lcg:key',
        revision: 1,
        epoch: 10,
        load: 2_000,
        completed: ['new-completion'],
        confirmed: []
      }),
      generationId: 'g2'
    }

    const merged = mergeLedgerSnapshots(
      oldGeneration,
      newGeneration
    )
    expect(merged.generationId).toBe('g2')
    expect(merged.currentEstimatedLoad).toBe(2_000)
    expect(merged.completedAssistantFingerprints).toEqual([
      'new-completion'
    ])
    expect(merged.confirmedFailureFingerprints).toEqual([])
  })

  it('does not keep attachment uncertainty sticky after the active branch no longer has it', () => {
    const attached = ledger({
      key: 'lcg:branch',
      revision: 1,
      epoch: 10,
      load: 2_000,
      fingerprints: ['attached'],
      uncertaintySources: ['attachment']
    })
    const clean = ledger({
      key: 'lcg:branch',
      revision: 2,
      epoch: 20,
      load: 1_000,
      fingerprints: ['clean'],
      uncertaintySources: []
    })

    const merged = mergeLedgerSnapshots(attached, clean)
    expect(merged.uncertaintySources).toEqual([])
    expect(merged.activeFingerprints).toEqual(['clean'])
  })

  it('migrates schema 9 evidence conservatively and never treats old assistant-only growth as turn growth', async () => {
    const storage = new MemoryStorage()
    storage.seed('conversationGuardState', {
      schemaVersion: 9,
      installSalt: 'migration-salt',
      settings: {
        enabled: true,
        generationId: 'g1',
        privacyConsentVersion: 1,
        privacyConsentedAt: 77
      },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          samples: [
            {
              conversationKey: 'chatgpt:legacy-limit',
              generationId: 'g1',
              firstConfirmedFailureLoad: 77_324,
              coverageState: 'complete',
              parserHealth: 'healthy',
              failureEvidenceQuality: 'confirmed',
              updatedAt: 2
            }
          ],
          recentAssistantTokenCounts: [900, 1800],
          growthHistoryConversationKeys: ['chatgpt:legacy-limit'],
          environmentConflictKeys: [],
          pendingFailureConfirmations: [],
          changePointSuggested: false,
          confidence: 0.8,
          suspiciousChangeCount: 0,
          verificationFactor: 1
        }
      ],
      ledgers: {
        'chatgpt:legacy-limit': {
          conversationKey: 'chatgpt:legacy-limit',
          generationId: 'g1',
          coverageState: 'complete',
          parserHealth: 'healthy',
          messages: [],
          activeFingerprints: [],
          currentEstimatedLoad: 77_324,
          hasUnmeasuredAttachments: false,
          updatedAt: 3
        }
      },
      conversationControls: {
        'chatgpt:legacy-limit': {
          muted: false,
          lastAlertLevel: 'high',
          snoozeUntilUserTurn: 9,
          updatedAt: 4
        }
      }
    })

    const state = await loadState(storage)
    const key = await anonymizeConversationKey(
      'chatgpt:legacy-limit',
      'migration-salt'
    )
    const generation = state.generations[0]!

    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(generation.turnGrowthSamples).toEqual([])
    expect(generation.samples[0]?.empiricalFailureLoad).toBe(77_324)
    expect(generation.samples[0]?.failureReferenceQuality).toBe(
      'provisional'
    )
    expect(generation.environmentSignature).toBeUndefined()
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('stale')
    expect(state.ledgers[key]?.uncertaintySources).toEqual([])
    expect(JSON.stringify(state)).not.toContain(
      'chatgpt:legacy-limit'
    )
    const writesAfterMigration = storage.setCount
    const reloaded = await loadState(storage)
    expect(reloaded).toEqual(state)
    expect(storage.setCount).toBe(writesAfterMigration)
  })

  it('migrates the published v2.0.2 schema 7 state without losing consent, mute state, or local evidence', async () => {
    const storage = new MemoryStorage()
    storage.seed('conversationGuardState', {
      schemaVersion: 7,
      installSalt: 'published-2.0.2-salt',
      settings: {
        enabled: true,
        generationId: 'g1',
        privacyConsentVersion: 1,
        privacyConsentedAt: 77
      },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          createdReason: 'initial',
          samples: [
            {
              conversationKey: 'chatgpt:published-limit',
              generationId: 'g1',
              highestConfirmedSafeLoad: 60_000,
              firstConfirmedFailureLoad: 77_324,
              coverageState: 'complete',
              parserHealth: 'healthy',
              successEvidenceQuality: 'complete',
              failureEvidenceQuality: 'confirmed',
              updatedAt: 2
            }
          ],
          confidence: 0.8,
          suspiciousChangeCount: 0,
          recentAssistantTokenCounts: [900, 1800],
          growthHistoryConversationKeys: ['chatgpt:published-limit'],
          environmentConflictKeys: [],
          pendingFailureConfirmations: [],
          changePointSuggested: false,
          verificationFactor: 1
        }
      ],
      ledgers: {
        'chatgpt:published-limit': {
          conversationKey: 'chatgpt:published-limit',
          generationId: 'g1',
          coverageState: 'complete',
          parserHealth: 'healthy',
          messages: [
            {
              fingerprint: 'legacy-message',
              contentFingerprint: 'legacy-content',
              role: 'user',
              tokenEstimate: 100,
              charCount: 400,
              observedAt: 3,
              localBranchId: 'active',
              ordinalHint: 0,
              attachmentCount: 1
            }
          ],
          activeFingerprints: ['legacy-message'],
          currentEstimatedLoad: 77_324,
          completedAssistantFingerprints: [],
          confirmedFailureFingerprints: ['legacy-failure'],
          dismissedFailureKeys: [],
          updatedAt: 5
        }
      },
      conversationControls: {
        'chatgpt:published-limit': {
          muted: true,
          lastAlertLevel: 'high',
          updatedAt: 6
        }
      }
    })

    const state = await loadState(storage)
    const key = await anonymizeConversationKey(
      'chatgpt:published-limit',
      'published-2.0.2-salt'
    )
    const generation = state.generations[0]!
    const migratedLedger = state.ledgers[key]!

    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(state.installSalt).toBe('published-2.0.2-salt')
    expect(state.settings.privacyConsentVersion).toBe(1)
    expect(state.settings.privacyConsentedAt).toBe(77)
    expect(generation.id).toBe('g1')
    expect(generation.turnGrowthSamples).toEqual([])
    expect(generation.samples[0]?.highestConfirmedSafeLoad).toBe(60_000)
    expect(generation.samples[0]?.empiricalFailureLoad).toBe(77_324)
    expect(generation.samples[0]?.failureReferenceQuality).toBe('provisional')
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('stale')
    expect(migratedLedger.ledgerRevision).toBe(1)
    expect(migratedLedger.observationEpoch).toBe(5)
    expect(migratedLedger.sequenceReliability).toBe('reliable')
    expect(migratedLedger.uncertaintySources).toEqual(['attachment'])
    expect(migratedLedger.confirmedFailureFingerprints).toEqual([
      'legacy-failure'
    ])
    expect(state.conversationControls[key]?.muted).toBe(true)
    expect(JSON.stringify(state)).not.toContain('chatgpt:published-limit')

    const writesAfterMigration = storage.setCount
    const reloaded = await loadState(storage)
    expect(reloaded).toEqual(state)
    expect(storage.setCount).toBe(writesAfterMigration)
  })

  it('downgrades ambiguous legacy failure quality to provisional instead of upgrading trust', async () => {
    const storage = new MemoryStorage()
    storage.seed('conversationGuardState', {
      schemaVersion: 9,
      installSalt: 'legacy-salt',
      settings: { enabled: true, generationId: 'g1' },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          samples: [
            {
              conversationKey: 'chatgpt:legacy',
              generationId: 'g1',
              firstConfirmedFailureLoad: 50_000,
              coverageState: 'mostly_complete',
              parserHealth: 'healthy',
              failureEvidenceQuality: 'confirmed',
              updatedAt: 2
            }
          ],
          pendingFailureConfirmations: []
        }
      ],
      ledgers: {},
      conversationControls: {}
    })

    const state = await loadState(storage)
    const generation = state.generations[0]!
    expect(generation.samples[0]?.failureReferenceQuality).toBe(
      'provisional'
    )
    expect(
      deriveCalibrationState({
        generation,
        currentEnvironment: env
      })
    ).toBe('stale')
  })

  it('migration is idempotent', async () => {
    const storage = new MemoryStorage()
    storage.seed('conversationGuardState', {
      schemaVersion: 9,
      installSalt: 'stable-salt',
      settings: { enabled: true, generationId: 'g1' },
      generations: [
        {
          id: 'g1',
          createdAt: 1,
          samples: [],
          pendingFailureConfirmations: []
        }
      ],
      ledgers: {},
      conversationControls: {}
    })

    const first = await loadState(storage)
    const writesAfterMigration = storage.setCount
    const second = await loadState(storage)
    expect(second).toEqual(first)
    expect(storage.setCount).toBe(writesAfterMigration)
  })

  it('read-only state refresh never writes current normalized state', async () => {
    const storage = new MemoryStorage()
    const first = await loadState(storage)
    const writesAfterInitialization = storage.setCount

    const second = await readState(storage)

    expect(second).toEqual(first)
    expect(storage.setCount).toBe(writesAfterInitialization)
  })

  it('keeps all persisted conversation references pseudonymous', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    state.ledgers['chatgpt:plain-id'] = {
      ...ledger({
        key: 'chatgpt:plain-id',
        revision: 1,
        epoch: 10,
        load: 100
      }),
      generationId: state.settings.generationId
    }
    await saveState(storage, state)
    const reloaded = await loadState(storage)

    const key = await anonymizeConversationKey(
      'chatgpt:plain-id',
      reloaded.installSalt
    )
    expect(isAnonymousConversationKey(key)).toBe(true)
    expect(Object.keys(reloaded.ledgers)).toEqual([key])
    expect(JSON.stringify(reloaded)).not.toContain('chatgpt:plain-id')
  })

  it('compacts long ledgers while preserving total load and evidence', async () => {
    const storage = new MemoryStorage()
    const initial = await loadState(storage)
    const messages = Array.from({ length: 40 }, (_, index) => ({
      fingerprint: `m-${index}`,
      contentFingerprint: `c-${index}`,
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      tokenEstimate: 10,
      charCount: 40,
      observedAt: index + 1,
      attachmentCount: index === 0 ? 1 : 0
    }))

    initial.ledgers['chatgpt:long'] = {
      conversationKey: 'chatgpt:long',
      generationId: initial.settings.generationId,
      ledgerRevision: 1,
      observationEpoch: 100,
      coverageState: 'complete',
      parserHealth: 'healthy',
      messages,
      activeFingerprints: messages.map((message) => message.fingerprint),
      sequenceReliability: 'reliable',
      currentEstimatedLoad: 400,
      uncertaintySources: ['attachment'],
      environmentSignature: env,
      completedAssistantFingerprints: ['done'],
      confirmedFailureFingerprints: ['failure'],
      dismissedFailureKeys: [],
      updatedAt: 100
    }
    await saveState(storage, initial)
    const reloaded = await loadState(storage)
    const key = await anonymizeConversationKey(
      'chatgpt:long',
      reloaded.installSalt
    )
    const saved = reloaded.ledgers[key]!

    expect(saved.messages).toHaveLength(32)
    expect(saved.retainedPrefixLoad).toBe(80)
    expect(saved.currentEstimatedLoad).toBe(400)
    expect(saved.uncertaintySources).toEqual(['attachment'])
    expect(saved.completedAssistantFingerprints).toEqual(['done'])
    expect(saved.confirmedFailureFingerprints).toEqual(['failure'])
    expect(saved.messages[0]).not.toHaveProperty('charCount')
    expect(saved.messages[0]).not.toHaveProperty('attachmentCount')
  })


  it('retains confirmed historical R after over 24 later safe-only chats and a same-contract restart', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    const generation = state.generations[0]!
    generation.environmentSignature = env
    generation.samples = [
      {
        conversationKey: 'chatgpt:certified-strong',
        generationId: generation.id,
        empiricalFailureLoad: 60_000,
        failureReferenceQuality: 'strong',
        coverageState: 'complete',
        parserHealth: 'healthy',
        sequenceReliability: 'reliable',
        uncertaintySources: [],
        environmentSignature: env,
        updatedAt: 1
      },
      {
        conversationKey: 'chatgpt:certified-conservative',
        generationId: generation.id,
        empiricalFailureLoad: 55_000,
        failureReferenceQuality: 'conservative',
        coverageState: 'complete',
        parserHealth: 'healthy',
        sequenceReliability: 'reliable',
        uncertaintySources: ['attachment'],
        environmentSignature: env,
        updatedAt: 2
      },
      ...Array.from({ length: 34 }, (_, i) => ({
        conversationKey: `chatgpt:safe-only-${i}`,
        generationId: generation.id,
        highestConfirmedSafeLoad: 500 + i,
        coverageState: 'complete' as const,
        parserHealth: 'healthy' as const,
        sequenceReliability: 'reliable' as const,
        uncertaintySources: [],
        environmentSignature: env,
        updatedAt: 100 + i
      }))
    ]

    await saveState(storage, state)
    const upgraded = await loadState(storage)
    const accepted = upgraded.generations[0]!
    const failureKeys = await Promise.all(
      ['chatgpt:certified-strong', 'chatgpt:certified-conservative']
        .map((id) => anonymizeConversationKey(id, upgraded.installSalt))
    )
    expect(accepted.samples.filter((sample) =>
      sample.empiricalFailureLoad !== undefined &&
      sample.failureReferenceQuality !== 'provisional'
    ).map((sample) => sample.conversationKey).sort())
      .toEqual(failureKeys.sort())
    expect(accepted.samples.filter((s) => s.empiricalFailureLoad === undefined))
      .toHaveLength(24)
    expect(accepted.environmentSignature).toEqual(env)
    expect(deriveCalibrationState({
      generation: accepted, currentEnvironment: env
    })).toBe('calibrated')
    expect(deriveCalibrationState({
      generation: accepted,
      currentEnvironment: { ...env, measurementSchemaVersion: 999 }
    })).toBe('stale')
    expect(upgraded.installSalt).toBe(state.installSalt)

    const writesBeforeNoopUpgrade = storage.setCount
    expect(await loadState(storage)).toEqual(upgraded)
    expect(storage.setCount).toBe(writesBeforeNoopUpgrade)
  })

  it('keeps old certified full-read L snapshots beyond the recent 12 ledgers without rescanning', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    for (let i = 0; i < 25; i += 1) {
      const key = `chatgpt:certified-history-${i}`
      const messages = Array.from({ length: 40 }, (_, index) => ({
        fingerprint: `stable-${i}-${index}`,
        contentFingerprint: `content-${i}-${index}`,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        tokenEstimate: 10,
        ordinalHint: index,
        observedAt: 1000 + i * 100 + index
      }))
      state.ledgers[key] = {
        ...ledger({ key, revision: 1, epoch: 100 + i, load: 400 }),
        generationId: state.settings.generationId,
        messages,
        activeFingerprints: messages.map((m) => m.fingerprint),
        updatedAt: 100 + i
      }
    }
    await saveState(storage, state)
    const restored = await loadState(storage)
    expect(Object.keys(restored.ledgers)).toHaveLength(25)

    const oldestKey = await anonymizeConversationKey(
      'chatgpt:certified-history-0', restored.installSalt
    )
    const newestKey = await anonymizeConversationKey(
      'chatgpt:certified-history-24', restored.installSalt
    )
    const oldest = restored.ledgers[oldestKey]!
    const newest = restored.ledgers[newestKey]!
    expect(oldest.currentEstimatedLoad).toBe(400)
    expect(oldest.messages).toHaveLength(8)
    expect(oldest.activeFingerprints).toHaveLength(8)
    expect(oldest.retainedPrefixLoad).toBe(320)
    expect(newest.messages).toHaveLength(32)
    expect(newest.retainedPrefixLoad).toBe(80)
    expect(oldest.coverageState).toBe('complete')
    expect(oldest.parserHealth).toBe('healthy')
    expect(oldest.sequenceReliability).toBe('reliable')
    expect(oldest.environmentSignature).toEqual(env)

    const writesBeforeReload = storage.setCount
    expect(await loadState(storage)).toEqual(restored)
    expect(storage.setCount).toBe(writesBeforeReload)
    expect(JSON.stringify(restored)).not.toContain('chatgpt:certified-history-0')
  })

  it('still discards old uncertified transient observations instead of treating them as complete caches', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    for (let i = 0; i < 20; i += 1) {
      const key = `chatgpt:partial-${i}`
      state.ledgers[key] = {
        ...ledger({ key, revision: 1, epoch: 50 + i, load: 10 }),
        generationId: state.settings.generationId,
        coverageState: 'incomplete',
        updatedAt: 50 + i
      }
    }
    await saveState(storage, state)
    const normalized = await loadState(storage)
    expect(Object.keys(normalized.ledgers)).toHaveLength(12)
    const oldestKey = await anonymizeConversationKey(
      'chatgpt:partial-0', normalized.installSalt
    )
    expect(normalized.ledgers[oldestKey]).toBeUndefined()
  })



  it('does not archive a legacy complete-looking ledger whose anchors cannot be authenticated', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    state.ledgers['chatgpt:unverifiable'] = {
      ...ledger({ key: 'chatgpt:unverifiable', revision: 1, epoch: 1, load: 100 }),
      generationId: state.settings.generationId,
      // An old schema may say complete but have no content fingerprint.
      // A bare local label cannot establish the same message instance.
      messages: [{
        fingerprint: 'bare-anchor',
        role: 'user',
        tokenEstimate: 100,
        observedAt: 1
      }],
      activeFingerprints: ['bare-anchor'],
      updatedAt: 1
    }
    for (let i = 0; i < 13; i += 1) {
      const key = `chatgpt:partial-new-${i}`
      state.ledgers[key] = {
        ...ledger({ key, revision: 1, epoch: 50 + i, load: 10 }),
        generationId: state.settings.generationId,
        coverageState: 'incomplete',
        updatedAt: 50 + i
      }
    }
    await saveState(storage, state)
    const restored = await loadState(storage)
    const unverified = await anonymizeConversationKey(
      'chatgpt:unverifiable', restored.installSalt
    )
    expect(restored.ledgers[unverified]).toBeUndefined()
    expect(Object.keys(restored.ledgers)).toHaveLength(12)
  })

  it('does not silently delete existing reference or certified L when browser local storage rejects a write', async () => {
    const memory = new MemoryStorage()
    const state = await loadState(memory)
    state.generations[0]!.environmentSignature = env
    state.generations[0]!.samples = [{
      conversationKey: 'chatgpt:calibrated-before-quota',
      generationId: state.settings.generationId,
      empiricalFailureLoad: 70_000,
      failureReferenceQuality: 'strong',
      coverageState: 'complete',
      parserHealth: 'healthy',
      sequenceReliability: 'reliable',
      uncertaintySources: [],
      environmentSignature: env,
      updatedAt: 1
    }]
    state.ledgers['chatgpt:complete-before-quota'] = {
      ...ledger({ key: 'chatgpt:complete-before-quota', revision: 1, epoch: 2, load: 10_000 }),
      generationId: state.settings.generationId
    }
    await saveState(memory, state)
    const before = await readState(memory)
    const deniedStorage: LocalStorageArea = {
      get: (keys) => memory.get(keys),
      set: async () => { throw new Error('QUOTA_BYTES') }
    }
    const extra = { ...before, ledgers: {
      ...before.ledgers,
      'chatgpt:attempted-new-entry': {
        ...ledger({ key: 'chatgpt:attempted-new-entry', revision: 1, epoch: 3, load: 500 }),
        generationId: state.settings.generationId
      }
    }}
    await expect(saveState(deniedStorage, extra)).rejects.toThrow('QUOTA_BYTES')
    const unchanged = await readState(memory)
    expect(unchanged).toEqual(before)
    expect(deriveCalibrationState({
      generation: unchanged.generations[0]!,
      currentEnvironment: env
    })).toBe('calibrated')
  })

  it('records affirmative privacy consent and keeps declined consent disabled', async () => {
    const storage = new MemoryStorage()
    const state = await loadState(storage)
    const accepted = withPrivacyConsent(state, true, 123)
    const declined = withPrivacyConsent(accepted, false, 456)

    expect(hasRequiredPrivacyConsent(accepted.settings)).toBe(true)
    expect(accepted.settings.privacyConsentVersion).toBe(1)
    expect(accepted.settings.privacyConsentedAt).toBe(123)
    expect(hasRequiredPrivacyConsent(declined.settings)).toBe(false)
    expect(hasDismissedPrivacyConsent(declined.settings)).toBe(true)
    expect(declined.settings.privacyConsentDismissedAt).toBe(456)
  })
})
