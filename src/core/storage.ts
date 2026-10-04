import { createGeneration, upsertConversationSample } from './calibration'
import {
  anonymizeConversationKey,
  createInstallSalt,
  isAnonymousConversationKey
} from './fingerprinter'
import type {
  CalibrationEvidenceSample,
  CalibrationGeneration,
  ConversationControl,
  EnvironmentSignature,
  FailureReferenceQuality,
  MessageRecord,
  PersistedConversationLedger,
  RiskState,
  TurnGrowthSample,
  UncertaintySource
} from './types'

export interface ExtensionSettings {
  enabled: boolean
  generationId: string
  privacyConsentVersion?: number
  privacyConsentedAt?: number
  privacyConsentDismissedAt?: number
}

export interface PersistedState {
  schemaVersion: number
  installSalt: string
  settings: ExtensionSettings
  generations: CalibrationGeneration[]
  ledgers: Record<string, PersistedConversationLedger>
  conversationControls: Record<string, ConversationControl>
}

export interface LocalStorageArea {
  get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

const STATE_KEY = 'conversationGuardState'
const DEFAULT_GENERATION_ID = 'default-generation'
export const CURRENT_SCHEMA_VERSION = 10
export const REQUIRED_PRIVACY_CONSENT_VERSION = 1
const MAX_PERSISTED_LEDGERS = 12
const MAX_EVIDENCE_SAMPLES = 24
const MAX_GROWTH_SAMPLES = 32
const MAX_COMPLETION_KEYS = 32
const MAX_FAILURE_KEYS = 8
const MAX_LEDGER_MESSAGE_RECORDS = 32
const MAX_CONVERSATION_CONTROLS = 16

export async function loadState(storage: LocalStorageArea): Promise<PersistedState> {
  const result = await storage.get(STATE_KEY)
  const raw = result[STATE_KEY]
  if (isPersistedStateLike(raw)) {
    const normalized = await normalizeState(raw as PersistedState)
    if (!persistedStatesEqual(raw as PersistedState, normalized)) {
      await storage.set({ [STATE_KEY]: normalized })
    }
    return normalized
  }

  const now = Date.now()
  const state: PersistedState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    installSalt: createInstallSalt(),
    settings: {
      enabled: true,
      generationId: DEFAULT_GENERATION_ID
    },
    generations: [createInitialGeneration(DEFAULT_GENERATION_ID, now)],
    ledgers: {},
    conversationControls: {}
  }
  await saveState(storage, state)
  return state
}

export async function readState(storage: LocalStorageArea): Promise<PersistedState> {
  const result = await storage.get(STATE_KEY)
  const raw = result[STATE_KEY]
  if (isPersistedStateLike(raw)) {
    return normalizeState(raw as PersistedState)
  }
  return loadState(storage)
}

export async function saveState(
  storage: LocalStorageArea,
  state: PersistedState
): Promise<void> {
  await storage.set({ [STATE_KEY]: await normalizeState(state) })
}

/**
 * Merge policy is explicit:
 * - message/evidence collections: union
 * - latest measurement fields: newest observationEpoch wins
 * - revision/timestamps: max
 * - generation: follows the newest measurement
 *
 * This prevents an older tab/window snapshot from replacing a newer active branch,
 * load, coverage, parser, sequence or uncertainty state.
 */
export function mergeLedgerSnapshots(
  existing: PersistedConversationLedger | undefined,
  incoming: PersistedConversationLedger
): PersistedConversationLedger {
  if (!existing) return normalizeLedger(incoming, incoming.generationId)

  const generationChanged = existing.generationId !== incoming.generationId
  const incomingIsLatest =
    generationChanged ||
    incoming.observationEpoch > existing.observationEpoch ||
    (incoming.observationEpoch === existing.observationEpoch &&
      incoming.updatedAt >= existing.updatedAt)
  const latest = incomingIsLatest ? incoming : existing

  const recordsByFingerprint = new Map<string, MessageRecord>()
  for (const record of [...existing.messages, ...incoming.messages]) {
    const current = recordsByFingerprint.get(record.fingerprint)
    if (!current || messageRecency(record) >= messageRecency(current)) {
      recordsByFingerprint.set(record.fingerprint, record)
    }
  }

  return {
    conversationKey: existing.conversationKey,
    generationId: latest.generationId,
    ledgerRevision: Math.max(existing.ledgerRevision, incoming.ledgerRevision),
    observationEpoch: Math.max(existing.observationEpoch, incoming.observationEpoch),
    coverageState: latest.coverageState,
    parserHealth: latest.parserHealth,
    messages: Array.from(recordsByFingerprint.values()).sort((a, b) => {
      return a.observedAt - b.observedAt || a.fingerprint.localeCompare(b.fingerprint)
    }),
    activeFingerprints: unique(latest.activeFingerprints),
    sequenceReliability: latest.sequenceReliability,
    ...(latest.sequenceUncertainReason
      ? { sequenceUncertainReason: latest.sequenceUncertainReason }
      : {}),
    currentEstimatedLoad: latest.currentEstimatedLoad,
    ...(latest.retainedPrefixLoad !== undefined
      ? { retainedPrefixLoad: latest.retainedPrefixLoad }
      : {}),
    uncertaintySources: unique(latest.uncertaintySources),
    ...(latest.environmentSignature
      ? { environmentSignature: latest.environmentSignature }
      : {}),
    completedAssistantFingerprints: generationChanged
      ? unique(latest.completedAssistantFingerprints)
      : unique([
          ...existing.completedAssistantFingerprints,
          ...incoming.completedAssistantFingerprints
        ]),
    confirmedFailureFingerprints: generationChanged
      ? unique(latest.confirmedFailureFingerprints)
      : unique([
          ...existing.confirmedFailureFingerprints,
          ...incoming.confirmedFailureFingerprints
        ]),
    dismissedFailureKeys: generationChanged
      ? unique(latest.dismissedFailureKeys)
      : unique([
          ...existing.dismissedFailureKeys,
          ...incoming.dismissedFailureKeys
        ]),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt)
  }
}

export async function normalizeState(raw: PersistedState): Promise<PersistedState> {
  const rawRecord = raw as PersistedState & Record<string, unknown>
  const schemaVersion =
    typeof rawRecord.schemaVersion === 'number' ? rawRecord.schemaVersion : 0
  const now = Date.now()
  const generationId = raw.settings?.generationId ?? DEFAULT_GENERATION_ID

  const rawGenerations = Array.isArray(raw.generations) ? raw.generations : []
  const generations =
    rawGenerations.length > 0
      ? rawGenerations.map((generation) => normalizeGeneration(generation, schemaVersion))
      : [createInitialGeneration(generationId, now)]

  const rawLedgers =
    raw.ledgers && typeof raw.ledgers === 'object' ? raw.ledgers : {}
  const ledgers = Object.fromEntries(
    Object.entries(rawLedgers).map(([key, ledger]) => [
      key,
      normalizeLedger(
        ledger as PersistedConversationLedger,
        generationId,
        schemaVersion
      )
    ])
  )

  const selectedGeneration =
    generations.find((generation) => generation.id === generationId) ??
    generations.at(-1) ??
    createInitialGeneration(generationId, now)

  const activeGeneration = compactGeneration(selectedGeneration)
  const compactedLedgers = compactLedgers(ledgers)
  const conversationControls = compactConversationControls(
    normalizeControls(raw.conversationControls ?? {}),
    compactedLedgers
  )

  return anonymizeConversationReferences({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    installSalt: raw.installSalt,
    settings: {
      enabled: raw.settings?.enabled ?? true,
      generationId: activeGeneration.id,
      ...consentSettings(raw.settings)
    },
    generations: [activeGeneration],
    ledgers: compactedLedgers,
    conversationControls
  })
}

function normalizeGeneration(
  generation: CalibrationGeneration,
  schemaVersion: number
): CalibrationGeneration {
  const legacy = generation as CalibrationGeneration & {
    recentAssistantTokenCounts?: number[]
    growthHistoryConversationKeys?: string[]
    warmStartPrior?: Record<string, unknown>
    samples?: Array<Record<string, unknown>>
  }

  const samples = (legacy.samples ?? []).map((sample) =>
    normalizeEvidenceSample(
      sample as unknown as Record<string, unknown>,
      generation.id
    )
  )

  const turnGrowthSamples =
    schemaVersion >= CURRENT_SCHEMA_VERSION && Array.isArray(generation.turnGrowthSamples)
      ? generation.turnGrowthSamples
          .map((sample) => normalizeTurnGrowthSample(sample, generation.id))
          .filter((sample): sample is TurnGrowthSample => Boolean(sample))
      : []

  const warmStartPrior = normalizeWarmStartPrior(
    legacy.warmStartPrior,
    generation.id
  )

  const normalized: CalibrationGeneration = {
    id: generation.id,
    createdAt: generation.createdAt,
    ...(generation.warmStartedFrom
      ? { warmStartedFrom: generation.warmStartedFrom }
      : {}),
    ...(generation.createdReason === 'environment_change' ||
    generation.createdReason === 'recalibrate' ||
    generation.createdReason === 'initial'
      ? { createdReason: generation.createdReason }
      : {}),
    ...(warmStartPrior ? { warmStartPrior } : {}),
    ...(isEnvironmentSignature(generation.environmentSignature)
      ? { environmentSignature: generation.environmentSignature }
      : {}),
    samples,
    turnGrowthSamples,
    environmentConflictKeys: unique(generation.environmentConflictKeys ?? []),
    pendingFailureConfirmations: generation.pendingFailureConfirmations ?? [],
    changePointSuggested: generation.changePointSuggested ?? false
  }

  return normalized
}

function normalizeEvidenceSample(
  raw: Record<string, unknown>,
  fallbackGenerationId: string
): CalibrationEvidenceSample {
  const safeLoad = finiteNumber(raw.highestConfirmedSafeLoad)
  const firstObservedAt = finiteNumber(raw.firstObservedAt)
  const lastObservedAt = finiteNumber(raw.lastObservedAt)
  const legacyFailure =
    finiteNumber(raw.empiricalFailureLoad) ??
    finiteNumber(raw.firstConfirmedFailureLoad)
  const legacyQuality = normalizeFailureQuality(
    raw.failureReferenceQuality ?? raw.failureEvidenceQuality
  )
  const legacyUncertainty = normalizeUncertaintySources(
    raw.uncertaintySources,
    raw.hasUnmeasuredAttachments === true
  )

  return {
    conversationKey: String(raw.conversationKey ?? ''),
    generationId: String(raw.generationId ?? fallbackGenerationId),
    ...(safeLoad !== undefined
      ? { highestConfirmedSafeLoad: safeLoad }
      : {}),
    ...(legacyFailure !== undefined ? { empiricalFailureLoad: legacyFailure } : {}),
    ...(legacyFailure !== undefined
      ? { failureReferenceQuality: legacyQuality }
      : {}),
    ...(isCoverageState(raw.coverageState)
      ? { coverageState: raw.coverageState }
      : {}),
    ...(isParserHealth(raw.parserHealth)
      ? { parserHealth: raw.parserHealth }
      : {}),
    ...(isSequenceReliability(raw.sequenceReliability)
      ? { sequenceReliability: raw.sequenceReliability }
      : {}),
    uncertaintySources: legacyUncertainty,
    ...(isEnvironmentSignature(raw.environmentSignature)
      ? { environmentSignature: raw.environmentSignature }
      : {}),
    ...(firstObservedAt !== undefined
      ? { firstObservedAt }
      : {}),
    ...(lastObservedAt !== undefined
      ? { lastObservedAt }
      : {}),
    updatedAt: finiteNumber(raw.updatedAt) ?? Date.now()
  }
}

function normalizeTurnGrowthSample(
  raw: TurnGrowthSample,
  fallbackGenerationId: string
): TurnGrowthSample | undefined {
  if (!raw || !Number.isFinite(raw.delta) || raw.delta <= 0) return undefined
  return {
    conversationKey: raw.conversationKey,
    generationId: raw.generationId ?? fallbackGenerationId,
    beforeLoad: Math.max(0, raw.beforeLoad),
    afterLoad: Math.max(0, raw.afterLoad),
    delta: Math.max(0, raw.delta),
    uncertain: Boolean(raw.uncertain),
    uncertaintySources: normalizeUncertaintySources(raw.uncertaintySources, false),
    observedAt: raw.observedAt
  }
}

function normalizeWarmStartPrior(
  raw: Record<string, unknown> | undefined,
  fallbackSourceGenerationId: string
): CalibrationGeneration['warmStartPrior'] | undefined {
  if (!raw) return undefined

  const safeLoad =
    finiteNumber(raw.safeLoad) ?? finiteNumber(raw.safeBoundary)
  const legacyFailure =
    raw.failureReference && typeof raw.failureReference === 'object'
      ? finiteNumber((raw.failureReference as Record<string, unknown>).load)
      : finiteNumber(raw.failureBoundary)
  const quality =
    raw.failureReference && typeof raw.failureReference === 'object'
      ? normalizeFailureQuality(
          (raw.failureReference as Record<string, unknown>).quality
        )
      : normalizeFailureQuality(raw.failureBoundaryQuality)

  if (safeLoad === undefined && legacyFailure === undefined) return undefined

  return {
    sourceGenerationId: String(
      raw.sourceGenerationId ?? fallbackSourceGenerationId
    ),
    ...(safeLoad !== undefined ? { safeLoad } : {}),
    ...(legacyFailure !== undefined && quality !== 'provisional'
      ? {
          failureReference: {
            load: legacyFailure,
            quality
          }
        }
      : {}),
    ...(isEnvironmentSignature(raw.environmentSignature)
      ? { environmentSignature: raw.environmentSignature }
      : {}),
    createdAt: finiteNumber(raw.createdAt) ?? Date.now()
  }
}

function compactGeneration(
  generation: CalibrationGeneration
): CalibrationGeneration {
  return {
    ...generation,
    samples: [...generation.samples]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_EVIDENCE_SAMPLES),
    turnGrowthSamples: generation.turnGrowthSamples.slice(-MAX_GROWTH_SAMPLES),
    environmentConflictKeys: unique(generation.environmentConflictKeys).slice(-8),
    pendingFailureConfirmations: generation.pendingFailureConfirmations.slice(-4)
  }
}

function compactLedgers(
  ledgers: Record<string, PersistedConversationLedger>
): Record<string, PersistedConversationLedger> {
  return Object.fromEntries(
    Object.values(ledgers)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PERSISTED_LEDGERS)
      .map((ledger) => [ledger.conversationKey, compactLedger(ledger)])
  )
}

function compactLedger(
  ledger: PersistedConversationLedger
): PersistedConversationLedger {
  const recordsByFingerprint = new Map(
    ledger.messages.map((message) => [message.fingerprint, message])
  )
  const requestedActive = unique(ledger.activeFingerprints)
  const activeRecords = requestedActive
    .map((fingerprint) => recordsByFingerprint.get(fingerprint))
    .filter((message): message is MessageRecord => Boolean(message))
  const sourceRecords =
    activeRecords.length > 0
      ? activeRecords
      : ledger.messages.slice(-MAX_LEDGER_MESSAGE_RECORDS)

  const sourceLoad = sourceRecords.reduce(
    (sum, message) => sum + Math.max(0, message.tokenEstimate),
    0
  )
  const basePrefixLoad = Math.max(
    0,
    ledger.retainedPrefixLoad ??
      ledger.currentEstimatedLoad - sourceLoad
  )
  const retainedRecords = sourceRecords.slice(-MAX_LEDGER_MESSAGE_RECORDS)
  const droppedLoad = sourceRecords
    .slice(0, Math.max(0, sourceRecords.length - retainedRecords.length))
    .reduce((sum, message) => sum + Math.max(0, message.tokenEstimate), 0)
  const retainedPrefixLoad = Math.max(0, basePrefixLoad + droppedLoad)

  const messages = retainedRecords.map((message) => ({
    fingerprint: message.fingerprint,
    ...(message.contentFingerprint
      ? { contentFingerprint: message.contentFingerprint }
      : {}),
    ...(message.stableHintHash
      ? { stableHintHash: message.stableHintHash }
      : {}),
    role: message.role,
    tokenEstimate: message.tokenEstimate,
    observedAt: message.observedAt
  }))

  return {
    conversationKey: ledger.conversationKey,
    generationId: ledger.generationId,
    ledgerRevision: ledger.ledgerRevision,
    observationEpoch: ledger.observationEpoch,
    coverageState: ledger.coverageState,
    parserHealth: ledger.parserHealth,
    messages,
    activeFingerprints: messages.map((message) => message.fingerprint),
    sequenceReliability: ledger.sequenceReliability,
    ...(ledger.sequenceUncertainReason
      ? { sequenceUncertainReason: ledger.sequenceUncertainReason }
      : {}),
    currentEstimatedLoad: ledger.currentEstimatedLoad,
    ...(retainedPrefixLoad > 0 ? { retainedPrefixLoad } : {}),
    uncertaintySources: unique(ledger.uncertaintySources),
    ...(ledger.environmentSignature
      ? { environmentSignature: ledger.environmentSignature }
      : {}),
    completedAssistantFingerprints: unique(
      ledger.completedAssistantFingerprints
    ).slice(-MAX_COMPLETION_KEYS),
    confirmedFailureFingerprints: unique(
      ledger.confirmedFailureFingerprints
    ).slice(-MAX_FAILURE_KEYS),
    dismissedFailureKeys: unique(ledger.dismissedFailureKeys).slice(-MAX_FAILURE_KEYS),
    updatedAt: ledger.updatedAt
  }
}

function normalizeLedger(
  raw: PersistedConversationLedger,
  fallbackGenerationId: string,
  sourceSchemaVersion = CURRENT_SCHEMA_VERSION
): PersistedConversationLedger {
  const legacy = raw as PersistedConversationLedger & {
    hasUnmeasuredAttachments?: boolean
  }
  const messages = Array.isArray(legacy.messages) ? legacy.messages : []
  const uncertaintySources = normalizeUncertaintySources(
    legacy.uncertaintySources,
    sourceSchemaVersion < CURRENT_SCHEMA_VERSION &&
      Boolean(
        legacy.hasUnmeasuredAttachments ||
          messages.some((message) => (message.attachmentCount ?? 0) > 0)
      )
  )
  const coverageState = isCoverageState(legacy.coverageState)
    ? legacy.coverageState
    : 'unknown'
  const parserHealth = isParserHealth(legacy.parserHealth)
    ? legacy.parserHealth
    : 'unreliable'
  const sequenceReliability =
    legacy.sequenceReliability === 'reliable' ||
    legacy.sequenceReliability === 'uncertain'
      ? legacy.sequenceReliability
      : legacy.sequenceUncertainReason
        ? 'uncertain'
        : parserHealth === 'healthy' && coverageState !== 'unknown'
          ? 'reliable'
          : 'uncertain'

  return {
    conversationKey: legacy.conversationKey,
    generationId: legacy.generationId ?? fallbackGenerationId,
    ledgerRevision: Math.max(1, finiteNumber(legacy.ledgerRevision) ?? 1),
    observationEpoch: Math.max(
      0,
      finiteNumber(legacy.observationEpoch) ??
        finiteNumber(legacy.updatedAt) ??
        0
    ),
    coverageState,
    parserHealth,
    messages,
    activeFingerprints: Array.isArray(legacy.activeFingerprints)
      ? unique(legacy.activeFingerprints)
      : [],
    sequenceReliability,
    ...(legacy.sequenceUncertainReason
      ? { sequenceUncertainReason: legacy.sequenceUncertainReason }
      : {}),
    currentEstimatedLoad: Math.max(
      0,
      finiteNumber(legacy.currentEstimatedLoad) ?? 0
    ),
    ...(finiteNumber(legacy.retainedPrefixLoad) !== undefined
      ? { retainedPrefixLoad: Math.max(0, finiteNumber(legacy.retainedPrefixLoad)!) }
      : {}),
    uncertaintySources,
    ...(isEnvironmentSignature(legacy.environmentSignature)
      ? { environmentSignature: legacy.environmentSignature }
      : {}),
    completedAssistantFingerprints: unique(
      legacy.completedAssistantFingerprints ?? []
    ),
    confirmedFailureFingerprints: unique(
      legacy.confirmedFailureFingerprints ?? []
    ),
    dismissedFailureKeys: unique(legacy.dismissedFailureKeys ?? []),
    updatedAt: finiteNumber(legacy.updatedAt) ?? Date.now()
  }
}

async function anonymizeConversationReferences(
  state: PersistedState
): Promise<PersistedState> {
  const cache = new Map<string, string>()
  const mapKey = async (value: string): Promise<string> => {
    if (isAnonymousConversationKey(value)) return value
    const cached = cache.get(value)
    if (cached) return cached
    const anonymous = await anonymizeConversationKey(value, state.installSalt)
    cache.set(value, anonymous)
    return anonymous
  }

  const ledgers: Record<string, PersistedConversationLedger> = {}
  for (const ledger of Object.values(state.ledgers)) {
    const conversationKey = await mapKey(ledger.conversationKey)
    const migrated = { ...ledger, conversationKey }
    ledgers[conversationKey] = mergeLedgerSnapshots(
      ledgers[conversationKey],
      migrated
    )
  }

  const generations: CalibrationGeneration[] = []
  for (const generation of state.generations) {
    let migrated: CalibrationGeneration = {
      ...generation,
      samples: [],
      turnGrowthSamples: []
    }
    for (const sample of generation.samples) {
      migrated = upsertConversationSample(migrated, {
        ...sample,
        conversationKey: await mapKey(sample.conversationKey)
      })
    }
    migrated.turnGrowthSamples = await Promise.all(
      generation.turnGrowthSamples.map(async (sample) => ({
        ...sample,
        conversationKey: await mapKey(sample.conversationKey)
      }))
    )
    migrated.environmentConflictKeys = unique(
      await Promise.all(
        generation.environmentConflictKeys.map((key) =>
          anonymizeEnvironmentConflictKey(key, mapKey)
        )
      )
    )
    migrated.pendingFailureConfirmations = await Promise.all(
      generation.pendingFailureConfirmations.map(async (pending) => ({
        ...pending,
        conversationKey: await mapKey(pending.conversationKey)
      }))
    )
    generations.push(migrated)
  }

  const conversationControls: Record<string, ConversationControl> = {}
  for (const [key, control] of Object.entries(state.conversationControls)) {
    const anonymousKey = await mapKey(key)
    const existing = conversationControls[anonymousKey]
    if (!existing || (control.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      conversationControls[anonymousKey] = control
    }
  }

  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generations,
    ledgers,
    conversationControls
  }
}

async function anonymizeEnvironmentConflictKey(
  value: string,
  mapKey: (value: string) => Promise<string>
): Promise<string> {
  const match = value.match(/^(safe|failure):(.+)$/)
  if (!match?.[1] || !match[2]) return value
  return `${match[1]}:${await mapKey(match[2])}`
}

function normalizeControls(
  controls: Record<string, ConversationControl>
): Record<string, ConversationControl> {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => {
      const legacy = control as ConversationControl & {
        lastAlertLevel?: unknown
        lastDisplayedLevel?: unknown
        lastAlertScore?: unknown
        lastAlertUserTurn?: unknown
        snoozeUntilUserTurn?: unknown
      }
      const lastAlertState =
        isRiskState(legacy.lastAlertState)
          ? legacy.lastAlertState
          : isRiskState(legacy.lastAlertLevel)
            ? legacy.lastAlertLevel
            : undefined
      return [
        key,
        {
          ...(legacy.muted !== undefined ? { muted: legacy.muted } : {}),
          ...(lastAlertState ? { lastAlertState } : {}),
          ...(legacy.updatedAt !== undefined ? { updatedAt: legacy.updatedAt } : {})
        }
      ]
    })
  )
}

function compactConversationControls(
  controls: Record<string, ConversationControl>,
  ledgers: Record<string, PersistedConversationLedger>
): Record<string, ConversationControl> {
  return Object.fromEntries(
    Object.entries(controls)
      .filter(([, control]) => hasMeaningfulControl(control))
      .sort(
        (a, b) =>
          controlRecency(b[0], b[1], ledgers) -
          controlRecency(a[0], a[1], ledgers)
      )
      .slice(0, MAX_CONVERSATION_CONTROLS)
  )
}

function hasMeaningfulControl(control: ConversationControl): boolean {
  return control.muted !== undefined || control.lastAlertState !== undefined
}

function controlRecency(
  conversationKey: string,
  control: ConversationControl,
  ledgers: Record<string, PersistedConversationLedger>
): number {
  return Math.max(
    0,
    control.updatedAt ?? ledgers[conversationKey]?.updatedAt ?? 0
  )
}

export function hasRequiredPrivacyConsent(
  settings: ExtensionSettings
): boolean {
  return (
    settings.privacyConsentVersion === REQUIRED_PRIVACY_CONSENT_VERSION &&
    typeof settings.privacyConsentedAt === 'number' &&
    Number.isFinite(settings.privacyConsentedAt)
  )
}

export function withPrivacyConsent(
  state: PersistedState,
  accepted: boolean,
  observedAt: number
): PersistedState {
  return {
    ...state,
    settings: accepted
      ? {
          enabled: state.settings.enabled,
          generationId: state.settings.generationId,
          privacyConsentVersion: REQUIRED_PRIVACY_CONSENT_VERSION,
          privacyConsentedAt: observedAt
        }
      : {
          enabled: state.settings.enabled,
          generationId: state.settings.generationId,
          privacyConsentDismissedAt: observedAt
        }
  }
}

export function hasDismissedPrivacyConsent(
  settings: ExtensionSettings
): boolean {
  return (
    !hasRequiredPrivacyConsent(settings) &&
    typeof settings.privacyConsentDismissedAt === 'number' &&
    Number.isFinite(settings.privacyConsentDismissedAt)
  )
}

function consentSettings(
  settings: Partial<ExtensionSettings> | undefined
): Pick<
  ExtensionSettings,
  'privacyConsentVersion' | 'privacyConsentedAt' | 'privacyConsentDismissedAt'
> {
  if (
    settings?.privacyConsentVersion === REQUIRED_PRIVACY_CONSENT_VERSION &&
    typeof settings.privacyConsentedAt === 'number' &&
    Number.isFinite(settings.privacyConsentedAt)
  ) {
    return {
      privacyConsentVersion: REQUIRED_PRIVACY_CONSENT_VERSION,
      privacyConsentedAt: settings.privacyConsentedAt
    }
  }

  return typeof settings?.privacyConsentDismissedAt === 'number' &&
    Number.isFinite(settings.privacyConsentDismissedAt)
    ? { privacyConsentDismissedAt: settings.privacyConsentDismissedAt }
    : {}
}

function createInitialGeneration(
  id: string,
  now: number
): CalibrationGeneration {
  const generation = createGeneration(id, now)
  generation.createdReason = 'initial'
  return generation
}

function normalizeFailureQuality(
  value: unknown
): FailureReferenceQuality {
  return value === 'strong' || value === 'conservative'
    ? value
    : 'provisional'
}

function normalizeUncertaintySources(
  value: unknown,
  legacyAttachment: boolean
): UncertaintySource[] {
  const result = new Set<UncertaintySource>()
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isUncertaintySource(item)) result.add(item)
    }
  }
  if (legacyAttachment) result.add('attachment')
  return [...result]
}

function isEnvironmentSignature(
  value: unknown
): value is EnvironmentSignature {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.parserSchemaVersion === 'string' &&
    typeof record.measurementSchemaVersion === 'number' &&
    (record.modelHint === undefined || typeof record.modelHint === 'string')
  )
}

function isCoverageState(
  value: unknown
): value is PersistedConversationLedger['coverageState'] {
  return (
    value === 'complete' ||
    value === 'mostly_complete' ||
    value === 'incomplete' ||
    value === 'unknown'
  )
}

function isParserHealth(
  value: unknown
): value is PersistedConversationLedger['parserHealth'] {
  return value === 'healthy' || value === 'degraded' || value === 'unreliable'
}

function isSequenceReliability(
  value: unknown
): value is PersistedConversationLedger['sequenceReliability'] {
  return value === 'reliable' || value === 'uncertain'
}

function isRiskState(value: unknown): value is RiskState {
  return (
    value === 'unknown' ||
    value === 'normal' ||
    value === 'long' ||
    value === 'organize' ||
    value === 'high'
  )
}

function isUncertaintySource(value: unknown): value is UncertaintySource {
  return (
    value === 'attachment' ||
    value === 'tool_result' ||
    value === 'web_search' ||
    value === 'code_execution' ||
    value === 'voice' ||
    value === 'generated_image' ||
    value === 'unknown_context'
  )
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function messageRecency(message: MessageRecord): number {
  return Math.max(message.observedAt, message.lastObservedAt ?? 0)
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function persistedStatesEqual(a: PersistedState, b: PersistedState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isPersistedStateLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<PersistedState>
  return (
    typeof state.installSalt === 'string' &&
    typeof state.settings === 'object' &&
    Array.isArray(state.generations) &&
    typeof state.ledgers === 'object' &&
    state.ledgers !== null
  )
}
