import { createGeneration } from './calibration'
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
export const CURRENT_SCHEMA_VERSION = 6
export const REQUIRED_PRIVACY_CONSENT_VERSION = 1

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
  const generations =
    raw.generations.length > 0
      ? raw.generations.map((generation) => ({
          ...generation,
          recentAssistantTokenCounts: generation.recentAssistantTokenCounts ?? [],
          pendingFailureConfirmations: generation.pendingFailureConfirmations ?? [],
          suspiciousChangeCount: generation.suspiciousChangeCount ?? 0,
          changePointSuggested: generation.changePointSuggested ?? false,
          verificationFactor: generation.verificationFactor ?? 1,
          feedbackBias: generation.feedbackBias ?? 0
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
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    installSalt: raw.installSalt,
    settings: {
      enabled: raw.settings?.enabled ?? true,
      generationId,
      ...consentSettings(raw.settings)
    },
    generations,
    ledgers,
    conversationControls: raw.conversationControls ?? {}
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
