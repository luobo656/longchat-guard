import { createGeneration, upsertConversationSample } from './calibration'
import { createInstallSalt } from './fingerprinter'
import type {
  CalibrationGeneration,
  ConversationControl,
  PersistedConversationLedger
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
export const CURRENT_SCHEMA_VERSION = 8
export const REQUIRED_PRIVACY_CONSENT_VERSION = 1
const MAX_PERSISTED_LEDGERS = 8
const MAX_BOUNDARY_SAMPLES = 24
const MAX_GROWTH_KEYS = 32
const MAX_COMPLETION_KEYS = 32
const MAX_FAILURE_KEYS = 8
const MAX_LEDGER_MESSAGE_RECORDS = 32

export async function loadState(storage: LocalStorageArea): Promise<PersistedState> {
  const result = await storage.get(STATE_KEY)
  const raw = result[STATE_KEY]
  if (isPersistedState(raw)) {
    const normalized = normalizeState(raw)
    if (normalized !== raw) await saveState(storage, normalized)
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

export async function saveState(storage: LocalStorageArea, state: PersistedState): Promise<void> {
  await storage.set({ [STATE_KEY]: normalizeState(state) })
}

export async function upsertLedgerSnapshot(
  storage: LocalStorageArea,
  snapshot: PersistedConversationLedger
): Promise<PersistedState> {
  const state = await loadState(storage)
  const existing = state.ledgers[snapshot.conversationKey]
  state.ledgers[snapshot.conversationKey] = mergeLedgerSnapshots(existing, snapshot)
  await saveState(storage, state)
  return state
}

export function mergeLedgerSnapshots(
  existing: PersistedConversationLedger | undefined,
  incoming: PersistedConversationLedger
): PersistedConversationLedger {
  if (!existing) return incoming

  const recordsByFingerprint = new Map(existing.messages.map((record) => [record.fingerprint, record]))
  for (const record of incoming.messages) {
    if (!recordsByFingerprint.has(record.fingerprint)) {
      recordsByFingerprint.set(record.fingerprint, record)
    }
  }

  return {
    ...incoming,
    messages: Array.from(recordsByFingerprint.values()).sort((a, b) => {
      return a.observedAt - b.observedAt || a.fingerprint.localeCompare(b.fingerprint)
    }),
    activeFingerprints:
      incoming.activeFingerprints.length > 0
        ? unique(incoming.activeFingerprints)
        : unique(existing.activeFingerprints),
    currentEstimatedLoad: incoming.currentEstimatedLoad,
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt)
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function isPersistedState(value: unknown): value is PersistedState {
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

function createInitialGeneration(id: string, now: number): CalibrationGeneration {
  const generation = createGeneration(id, now)
  generation.createdReason = 'initial'
  return generation
}

export function normalizeState(raw: PersistedState): PersistedState {
  const now = Date.now()
  const generationId = raw.settings?.generationId ?? DEFAULT_GENERATION_ID
  let generations =
    raw.generations.length > 0
      ? raw.generations.map((generation) => ({
          ...generation,
          recentAssistantTokenCounts: generation.recentAssistantTokenCounts ?? [],
          growthHistoryConversationKeys: generation.growthHistoryConversationKeys ?? [],
          environmentConflictKeys: generation.environmentConflictKeys ?? [],
          pendingFailureConfirmations: generation.pendingFailureConfirmations ?? [],
          suspiciousChangeCount:
            generation.environmentConflictKeys?.length ?? generation.suspiciousChangeCount ?? 0,
          changePointSuggested: generation.changePointSuggested ?? false,
          verificationFactor: generation.verificationFactor ?? 1
        }))
      : [createInitialGeneration(generationId, now)]
  const ledgers = Object.fromEntries(
    Object.entries(raw.ledgers ?? {}).map(([key, ledger]) => [
      key,
      {
        ...ledger,
        completedAssistantFingerprints: ledger.completedAssistantFingerprints ?? [],
        confirmedFailureFingerprints: ledger.confirmedFailureFingerprints ?? [],
        dismissedFailureKeys: ledger.dismissedFailureKeys ?? []
      }
    ])
  )
  if ((raw.schemaVersion ?? 0) < 7) {
    // 2.0.x migration: preserve reply-growth evidence from existing local ledgers.
    const eligibleLedgers = Object.values(ledgers).filter((ledger) =>
      ledger.generationId === generationId &&
      (ledger.coverageState === 'complete' || ledger.coverageState === 'mostly_complete') &&
      ledger.parserHealth !== 'unreliable'
    )
    const historicalGrowth = eligibleLedgers
      .flatMap((ledger) => ledger.messages)
      .filter((message) => message.role === 'assistant' && message.tokenEstimate > 0)
      .sort((a, b) => a.observedAt - b.observedAt)
      .map((message) => message.tokenEstimate)
      .slice(-32)
    if (historicalGrowth.length > 0) {
      generations = generations.map((generation) =>
        generation.id === generationId
          ? {
              ...generation,
              recentAssistantTokenCounts: historicalGrowth,
              growthHistoryConversationKeys: unique([
                ...(generation.growthHistoryConversationKeys ?? []),
                ...eligibleLedgers.map((ledger) => ledger.conversationKey)
              ])
            }
          : generation
      )
    }
  }

  if ((raw.schemaVersion ?? 0) < 8) {
    generations = generations.map((generation) => {
      if (generation.id !== generationId) return generation
      let migrated = generation
      for (const ledger of Object.values(ledgers)) {
        if (
          ledger.generationId !== generationId ||
          ledger.coverageState !== 'complete' ||
          ledger.parserHealth !== 'healthy'
        ) {
          continue
        }
        const recordsByFingerprint = new Map(
          ledger.messages.map((message) => [message.fingerprint, message])
        )
        let cumulativeLoad = Math.max(0, ledger.retainedPrefixLoad ?? 0)
        let safeLoad: number | undefined
        for (const fingerprint of ledger.activeFingerprints) {
          const message = recordsByFingerprint.get(fingerprint)
          if (!message) continue
          cumulativeLoad += Math.max(0, message.tokenEstimate)
          if (message.role === 'assistant') safeLoad = cumulativeLoad
        }
        if (safeLoad === undefined) continue
        migrated = upsertConversationSample(migrated, {
          conversationKey: ledger.conversationKey,
          generationId: migrated.id,
          highestConfirmedSafeLoad: safeLoad,
          coverageState: 'complete',
          parserHealth: 'healthy',
          successEvidenceQuality: 'complete',
          updatedAt: ledger.updatedAt
        })
      }
      return migrated
    })
  }

  const selectedGeneration =
    generations.find((generation) => generation.id === generationId) ??
    generations.at(-1) ??
    createInitialGeneration(generationId, now)
  const activeGeneration = compactGeneration(selectedGeneration)
  const compactedLedgers = compactLedgers(ledgers)
  const conversationControls = raw.conversationControls ?? {}

  return {
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
  }
}

function compactGeneration(generation: CalibrationGeneration): CalibrationGeneration {
  return {
    ...generation,
    samples: [...generation.samples]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_BOUNDARY_SAMPLES),
    recentAssistantTokenCounts: (generation.recentAssistantTokenCounts ?? []).slice(-32),
    growthHistoryConversationKeys: unique(
      generation.growthHistoryConversationKeys ?? []
    ).slice(-MAX_GROWTH_KEYS),
    environmentConflictKeys: unique(generation.environmentConflictKeys ?? []).slice(-8),
    pendingFailureConfirmations: (generation.pendingFailureConfirmations ?? []).slice(-4)
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

function compactLedger(ledger: PersistedConversationLedger): PersistedConversationLedger {
  const recordsByFingerprint = new Map(
    ledger.messages.map((message) => [message.fingerprint, message])
  )
  const requestedActive = unique(ledger.activeFingerprints)
  const activeRecords = requestedActive
    .map((fingerprint) => recordsByFingerprint.get(fingerprint))
    .filter((message): message is NonNullable<typeof message> => Boolean(message))
  const sourceRecords = activeRecords.length > 0 ? activeRecords : ledger.messages.slice(-MAX_LEDGER_MESSAGE_RECORDS)
  const basePrefixLoad = Math.max(
    0,
    ledger.retainedPrefixLoad ??
      ledger.currentEstimatedLoad - activeRecords.reduce((sum, message) => sum + message.tokenEstimate, 0)
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
    ...(message.stableHintHash ? { stableHintHash: message.stableHintHash } : {}),
    role: message.role,
    tokenEstimate: message.tokenEstimate,
    observedAt: message.observedAt
  }))
  const activeFingerprints = messages.map((message) => message.fingerprint)

  return {
    conversationKey: ledger.conversationKey,
    generationId: ledger.generationId,
    coverageState: ledger.coverageState,
    parserHealth: ledger.parserHealth,
    messages,
    activeFingerprints,
    currentEstimatedLoad: ledger.currentEstimatedLoad,
    ...(retainedPrefixLoad > 0 ? { retainedPrefixLoad } : {}),
    completedAssistantFingerprints: unique(
      ledger.completedAssistantFingerprints ?? []
    ).slice(-MAX_COMPLETION_KEYS),
    confirmedFailureFingerprints: unique(
      ledger.confirmedFailureFingerprints ?? []
    ).slice(-MAX_FAILURE_KEYS),
    dismissedFailureKeys: unique(ledger.dismissedFailureKeys ?? []).slice(-MAX_FAILURE_KEYS),
    updatedAt: ledger.updatedAt
  }
}

export function hasRequiredPrivacyConsent(settings: ExtensionSettings): boolean {
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

export function hasDismissedPrivacyConsent(settings: ExtensionSettings): boolean {
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
