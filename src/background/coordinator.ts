import {
  loadState,
  readState,
  saveState,
  mergeLedgerSnapshots,
  withPrivacyConsent,
  type LocalStorageArea,
  type PersistedState
} from '../core/storage'
import { reconcileSequence, type TailEvidence } from '../core/sequence-reconciler'
import {
  recordConfirmedFailureReference,
  recordFailureObservation,
  recordSuccessfulAssistantCompletion,
  recordTurnGrowth,
  summarizeGeneration
} from '../core/calibration'
import { assessRisk } from '../core/risk-engine'
import { anonymizeConversationKey } from '../core/fingerprinter'
import { clearLearningData, startNewGeneration } from '../core/generation-manager'
import {
  deriveCalibrationState,
  deriveEnvironmentConfidence,
  deriveMeasurementState
} from '../core/product-state'
import type {
  CalibrationGeneration,
  ConversationControl,
  CoverageState,
  EnvironmentSignature,
  ErrorKind,
  EvidenceConfidence,
  ObservedMessageRecord,
  ParserHealth,
  PersistedConversationLedger,
  RiskAssessment,
  UncertaintySource
} from '../core/types'

export interface ObservedConversationWindow {
  conversationKey: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  tailEvidence: TailEvidence
  observedMessages: ObservedMessageRecord[]
  composerTokenEstimate: number
  environmentSignature: EnvironmentSignature
  uncertaintySources: UncertaintySource[]
  expectedGenerationId: string
  baseRevision: number
  observationEpoch: number
  observedAt: number
}

export interface CompletionEvent {
  conversationKey: string
  assistantFingerprint: string
  beforeTurnLoad: number
  expectedGenerationId: string
  expectedLedgerRevision: number
  observedAt: number
}

export interface FailureEvent {
  conversationKey: string
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  composerTokenEstimate: number
  expectedGenerationId: string
  expectedLedgerRevision: number
  observedAt: number
}

export interface CalibrationCommitEvent {
  conversationKey: string
  expectedGenerationId: string
  expectedLedgerRevision: number
  scanSessionId: string
  environmentSignature: EnvironmentSignature
  uncertaintySources: UncertaintySource[]
  observedMessages: ObservedMessageRecord[]
  observedAt: number
}

export interface MeasurementScanCommitEvent {
  conversationKey: string
  expectedGenerationId: string
  expectedLedgerRevision: number
  environmentSignature: EnvironmentSignature
  uncertaintySources: UncertaintySource[]
  observedMessages: ObservedMessageRecord[]
  observedAt: number
}

export type BackgroundRequest =
  | { type: 'guard.loadState' }
  | { type: 'guard.readState' }
  | { type: 'guard.observeWindow'; window: ObservedConversationWindow }
  | { type: 'guard.recordCompletion'; event: CompletionEvent }
  | { type: 'guard.recordFailure'; event: FailureEvent }
  | { type: 'guard.commitCalibration'; event: CalibrationCommitEvent }
  | { type: 'guard.commitMeasurementScan'; event: MeasurementScanCommitEvent }
  | { type: 'guard.startGeneration'; reason: 'environment_change' | 'recalibrate'; observedAt: number }
  | { type: 'guard.clearLearning'; observedAt: number }
  | { type: 'guard.confirmPendingFailure'; conversationKey: string; accepted: boolean; observedAt: number }
  | { type: 'guard.updateControl'; conversationKey: string; patch: Partial<ConversationControl> }
  | { type: 'guard.updatePrivacyConsent'; accepted: boolean; observedAt: number }

export type BackgroundResponse =
  | {
      ok: true
      state: PersistedState
      snapshot?: PersistedConversationLedger
      risk?: RiskAssessment
      staleObservation?: boolean
    }
  | { ok: false; error: string }

export class StorageMutationCoordinator {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: LocalStorageArea) {}

  loadState(): Promise<PersistedState> {
    return this.enqueue(() => loadState(this.storage))
  }

  readState(): Promise<PersistedState> {
    return this.enqueue(() => readState(this.storage))
  }

  observeWindow(window: ObservedConversationWindow): Promise<{
    state: PersistedState
    snapshot?: PersistedConversationLedger
    risk?: RiskAssessment
    staleObservation: boolean
  }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const generation = currentGeneration(state)
      if (!generation) throw new Error('missing_generation')

      const conversationKey = await anonymizeConversationKey(
        window.conversationKey,
        state.installSalt
      )
      const existing = state.ledgers[conversationKey]

      if (window.expectedGenerationId !== state.settings.generationId) {
        return {
          state,
          ...(existing
            ? {
                snapshot: existing,
                risk: riskFor(
                  existing,
                  generation,
                  window.composerTokenEstimate
                )
              }
            : {}),
          staleObservation: true
        }
      }

      if (
        existing &&
        window.baseRevision !== existing.ledgerRevision
      ) {
        return {
          state,
          snapshot: existing,
          risk: riskFor(
            existing,
            generation,
            window.composerTokenEstimate
          ),
          staleObservation: true
        }
      }

      const reconcileResult = reconcileSequence({
        existingMessages: existing?.messages ?? [],
        activeFingerprints: existing?.activeFingerprints ?? [],
        observed: window.observedMessages,
        tailEvidence: window.tailEvidence,
        coverageState: window.coverageState,
        parserHealth: window.parserHealth,
        now: window.observedAt
      })

      const retainedPrefixLoad =
        reconcileResult.reliability === 'reliable'
          ? Math.max(0, existing?.retainedPrefixLoad ?? 0)
          : 0

      const currentEstimatedLoad =
        retainedPrefixLoad +
        reconcileResult.activeFingerprints.reduce((total, fingerprint) => {
          const message = reconcileResult.messages.find(
            (item) => item.fingerprint === fingerprint
          )
          return total + Math.max(0, message?.tokenEstimate ?? 0)
        }, 0)

      const uncertaintySources = unique([
        ...window.uncertaintySources,
        ...(window.observedMessages.some(
          (message) => (message.attachmentCount ?? 0) > 0
        )
          ? (['attachment'] as const)
          : [])
      ])

      const sameGeneration = existing?.generationId === generation.id
      const snapshot: PersistedConversationLedger = {
        conversationKey,
        generationId: generation.id,
        ledgerRevision: (existing?.ledgerRevision ?? 0) + 1,
        observationEpoch: Math.max(
          window.observationEpoch,
          window.observedAt
        ),
        coverageState: reconcileResult.coverageState,
        parserHealth: reconcileResult.parserHealth,
        messages: reconcileResult.messages,
        activeFingerprints: reconcileResult.activeFingerprints,
        sequenceReliability: reconcileResult.reliability,
        ...(reconcileResult.uncertainReason
          ? { sequenceUncertainReason: reconcileResult.uncertainReason }
          : {}),
        currentEstimatedLoad,
        ...(retainedPrefixLoad > 0 ? { retainedPrefixLoad } : {}),
        uncertaintySources,
        environmentSignature: window.environmentSignature,
        completedAssistantFingerprints:
          sameGeneration
            ? existing?.completedAssistantFingerprints ?? []
            : [],
        confirmedFailureFingerprints:
          sameGeneration
            ? existing?.confirmedFailureFingerprints ?? []
            : [],
        dismissedFailureKeys:
          sameGeneration ? existing?.dismissedFailureKeys ?? [] : [],
        updatedAt: window.observedAt
      }

      if (existing && observationEquivalent(existing, snapshot)) {
        return {
          state,
          snapshot: existing,
          risk: riskFor(
            existing,
            generation,
            window.composerTokenEstimate
          ),
          staleObservation: false
        }
      }

      const merged = mergeLedgerSnapshots(existing, snapshot)
      state.ledgers[conversationKey] = merged
      const risk = riskFor(
        merged,
        generation,
        window.composerTokenEstimate
      )
      await saveState(this.storage, state)
      return {
        state,
        snapshot: merged,
        risk,
        staleObservation: false
      }
    })
  }

  recordCompletion(
    event: CompletionEvent
  ): Promise<{ state: PersistedState; risk?: RiskAssessment }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const conversationKey = await anonymizeConversationKey(
        event.conversationKey,
        state.installSalt
      )
      const ledger = state.ledgers[conversationKey]
      const generation = currentGeneration(state)
      if (!ledger || !generation) return { state }
      if (event.expectedGenerationId !== state.settings.generationId) {
        return { state, risk: riskFor(ledger, generation, 0) }
      }
      if (ledger.ledgerRevision !== event.expectedLedgerRevision) {
        return { state, risk: riskFor(ledger, generation, 0) }
      }

      if (
        ledger.completedAssistantFingerprints.includes(
          event.assistantFingerprint
        )
      ) {
        return { state, risk: riskFor(ledger, generation, 0) }
      }

      ledger.completedAssistantFingerprints = unique([
        ...ledger.completedAssistantFingerprints,
        event.assistantFingerprint
      ])
      ledger.ledgerRevision += 1
      ledger.observationEpoch = Math.max(
        ledger.observationEpoch,
        event.observedAt
      )
      ledger.updatedAt = Math.max(ledger.updatedAt, event.observedAt)

      let updatedGeneration = recordSuccessfulAssistantCompletion(
        generation,
        {
          conversationKey,
          generationId: generation.id,
          estimatedLoad: ledger.currentEstimatedLoad,
          assistantFingerprint: event.assistantFingerprint,
          coverageState: ledger.coverageState,
          parserHealth: ledger.parserHealth,
          sequenceReliability: ledger.sequenceReliability,
          uncertaintySources: ledger.uncertaintySources,
          ...(ledger.environmentSignature
            ? { environmentSignature: ledger.environmentSignature }
            : {}),
          observedAt: event.observedAt
        }
      )

      const delta = ledger.currentEstimatedLoad - event.beforeTurnLoad
      if (delta > 0) {
        const measurementState = deriveMeasurementState({
          supported: true,
          ledger
        })
        updatedGeneration = recordTurnGrowth(updatedGeneration, {
          conversationKey,
          generationId: generation.id,
          beforeLoad: Math.max(0, event.beforeTurnLoad),
          afterLoad: ledger.currentEstimatedLoad,
          delta,
          uncertain:
            measurementState !== 'complete' ||
            ledger.uncertaintySources.length > 0,
          uncertaintySources: ledger.uncertaintySources,
          observedAt: event.observedAt
        })
      }

      replaceGeneration(state, updatedGeneration)
      await saveState(this.storage, state)
      return {
        state,
        risk: riskFor(ledger, updatedGeneration, 0)
      }
    })
  }

  recordFailure(
    event: FailureEvent
  ): Promise<{ state: PersistedState; risk?: RiskAssessment }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const conversationKey = await anonymizeConversationKey(
        event.conversationKey,
        state.installSalt
      )
      const ledger = state.ledgers[conversationKey]
      const generation = currentGeneration(state)
      if (!ledger || !generation) return { state }
      if (event.expectedGenerationId !== state.settings.generationId) {
        return {
          state,
          risk: riskFor(
            ledger,
            generation,
            event.composerTokenEstimate
          )
        }
      }
      if (ledger.ledgerRevision !== event.expectedLedgerRevision) {
        return {
          state,
          risk: riskFor(
            ledger,
            generation,
            event.composerTokenEstimate
          )
        }
      }

      if (event.errorKind !== 'conversation_length_limit') {
        return {
          state,
          risk: riskFor(
            ledger,
            generation,
            event.composerTokenEstimate
          )
        }
      }

      const estimatedLoad =
        ledger.currentEstimatedLoad +
        Math.max(0, event.composerTokenEstimate)
      const confirmedKey = passiveConfirmedFailureKey(
        generation.id,
        event.errorKind
      )
      const dismissedKey = dismissedFailureKey(
        generation.id,
        event.errorKind
      )
      if (
        ledger.confirmedFailureFingerprints.includes(confirmedKey) ||
        ledger.dismissedFailureKeys.includes(dismissedKey)
      ) {
        return {
          state,
          risk: riskFor(
            ledger,
            generation,
            event.composerTokenEstimate
          )
        }
      }

      const updatedGeneration = recordFailureObservation(
        generation,
        {
          conversationKey,
          generationId: generation.id,
          estimatedLoad,
          errorKind: event.errorKind,
          confidence: event.confidence,
          coverageState: ledger.coverageState,
          parserHealth: ledger.parserHealth,
          sequenceReliability: ledger.sequenceReliability,
          uncertaintySources: ledger.uncertaintySources,
          ...(ledger.environmentSignature
            ? { environmentSignature: ledger.environmentSignature }
            : {}),
          observedAt: event.observedAt
        }
      )

      replaceGeneration(state, updatedGeneration)
      await saveState(this.storage, state)
      return {
        state,
        risk: riskFor(
          ledger,
          updatedGeneration,
          event.composerTokenEstimate
        )
      }
    })
  }

  commitMeasurementScan(
    event: MeasurementScanCommitEvent
  ): Promise<{
    state: PersistedState
    snapshot: PersistedConversationLedger
    risk: RiskAssessment
  }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      if (state.settings.generationId !== event.expectedGenerationId) {
        throw new Error('generation_changed_during_scan')
      }
      const generation = currentGeneration(state)
      if (!generation) throw new Error('missing_generation')

      const conversationKey = await anonymizeConversationKey(
        event.conversationKey,
        state.installSalt
      )
      const existing = state.ledgers[conversationKey]
      const currentRevision = existing?.ledgerRevision ?? 0
      if (currentRevision !== event.expectedLedgerRevision) {
        throw new Error('ledger_changed_during_scan')
      }
      validateFullHistoryScan(event.observedMessages, 'measurement')

      const snapshot = fullHistorySnapshot({
        existing,
        conversationKey,
        generationId: generation.id,
        currentRevision,
        environmentSignature: event.environmentSignature,
        uncertaintySources: event.uncertaintySources,
        observedMessages: event.observedMessages,
        observedAt: event.observedAt
      })
      const merged = mergeLedgerSnapshots(existing, snapshot)
      state.ledgers[conversationKey] = merged
      await saveState(this.storage, state)

      return {
        state,
        snapshot: merged,
        risk: riskFor(merged, generation, 0)
      }
    })
  }

  commitCalibration(
    event: CalibrationCommitEvent
  ): Promise<{
    state: PersistedState
    snapshot: PersistedConversationLedger
    risk: RiskAssessment
  }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      if (state.settings.generationId !== event.expectedGenerationId) {
        throw new Error('generation_changed_during_scan')
      }
      const generation = currentGeneration(state)
      if (!generation) throw new Error('missing_generation')

      const conversationKey = await anonymizeConversationKey(
        event.conversationKey,
        state.installSalt
      )
      const existing = state.ledgers[conversationKey]
      const currentRevision = existing?.ledgerRevision ?? 0
      if (currentRevision !== event.expectedLedgerRevision) {
        throw new Error('ledger_changed_during_scan')
      }
      validateFullHistoryScan(event.observedMessages, 'calibration')

      const snapshot = fullHistorySnapshot({
        existing,
        conversationKey,
        generationId: generation.id,
        currentRevision,
        environmentSignature: event.environmentSignature,
        uncertaintySources: event.uncertaintySources,
        observedMessages: event.observedMessages,
        observedAt: event.observedAt,
        calibrationFailureFingerprint: calibrationFailureKey(
          generation.id,
          event.scanSessionId
        )
      })

      const merged = mergeLedgerSnapshots(existing, snapshot)
      state.ledgers[conversationKey] = merged

      const updatedGeneration = recordConfirmedFailureReference(
        generation,
        {
          conversationKey,
          generationId: generation.id,
          estimatedLoad: merged.currentEstimatedLoad,
          errorKind: 'conversation_length_limit',
          coverageState: merged.coverageState,
          parserHealth: merged.parserHealth,
          sequenceReliability: merged.sequenceReliability,
          uncertaintySources: merged.uncertaintySources,
          environmentSignature: event.environmentSignature,
          observedAt: event.observedAt
        }
      )
      replaceGeneration(state, updatedGeneration)
      await saveState(this.storage, state)

      return {
        state,
        snapshot: merged,
        risk: riskFor(merged, updatedGeneration, 0)
      }
    })
  }

  startGeneration(
    reason: 'environment_change' | 'recalibrate',
    observedAt: number
  ): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const next = startNewGeneration(state, reason, observedAt)
      await saveState(this.storage, next)
      return next
    })
  }

  clearLearning(observedAt: number): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const next = clearLearningData(state, observedAt)
      await saveState(this.storage, next)
      return next
    })
  }

  confirmPendingFailure(
    conversationKey: string,
    accepted: boolean,
    observedAt: number
  ): Promise<{ state: PersistedState; risk?: RiskAssessment }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      conversationKey = await anonymizeConversationKey(
        conversationKey,
        state.installSalt
      )
      const generation = currentGeneration(state)
      const ledger = state.ledgers[conversationKey]
      if (!generation || !ledger) return { state }

      const pending = generation.pendingFailureConfirmations.find(
        (item) => item.conversationKey === conversationKey
      )
      if (!pending) {
        return { state, risk: riskFor(ledger, generation, 0) }
      }

      if (!accepted) {
        ledger.dismissedFailureKeys = unique([
          ...ledger.dismissedFailureKeys,
          dismissedFailureKey(generation.id, pending.errorKind)
        ])
        ledger.ledgerRevision += 1
        ledger.observationEpoch = Math.max(
          ledger.observationEpoch,
          observedAt
        )
        ledger.updatedAt = Math.max(ledger.updatedAt, observedAt)
        const updatedGeneration: CalibrationGeneration = {
          ...generation,
          pendingFailureConfirmations:
            generation.pendingFailureConfirmations.filter(
              (item) => item.conversationKey !== conversationKey
            )
        }
        replaceGeneration(state, updatedGeneration)
        await saveState(this.storage, state)
        return {
          state,
          risk: riskFor(ledger, updatedGeneration, 0)
        }
      }

      const updatedGeneration = recordConfirmedFailureReference(
        {
          ...generation,
          pendingFailureConfirmations:
            generation.pendingFailureConfirmations.filter(
              (item) => item.conversationKey !== conversationKey
            )
        },
        {
          conversationKey,
          generationId: generation.id,
          estimatedLoad: pending.estimatedLoad,
          errorKind: pending.errorKind,
          coverageState: pending.coverageState ?? 'unknown',
          parserHealth: pending.parserHealth ?? 'unreliable',
          sequenceReliability:
            pending.sequenceReliability ?? 'uncertain',
          uncertaintySources:
            pending.uncertaintySources ?? ['unknown_context'],
          ...(pending.environmentSignature
            ? { environmentSignature: pending.environmentSignature }
            : {}),
          observedAt
        }
      )

      ledger.confirmedFailureFingerprints = unique([
        ...ledger.confirmedFailureFingerprints,
        passiveConfirmedFailureKey(
          generation.id,
          pending.errorKind
        )
      ])
      ledger.ledgerRevision += 1
      ledger.observationEpoch = Math.max(
        ledger.observationEpoch,
        observedAt
      )
      ledger.updatedAt = Math.max(ledger.updatedAt, observedAt)
      replaceGeneration(state, updatedGeneration)
      await saveState(this.storage, state)
      return {
        state,
        risk: riskFor(ledger, updatedGeneration, 0)
      }
    })
  }

  updateControl(
    conversationKey: string,
    patch: Partial<ConversationControl>
  ): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      conversationKey = await anonymizeConversationKey(
        conversationKey,
        state.installSalt
      )
      state.conversationControls[conversationKey] = {
        ...(state.conversationControls[conversationKey] ?? {}),
        ...patch,
        updatedAt: Date.now()
      }
      await saveState(this.storage, state)
      return state
    })
  }

  updatePrivacyConsent(
    accepted: boolean,
    observedAt: number
  ): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const next = withPrivacyConsent(state, accepted, observedAt)
      await saveState(this.storage, next)
      return next
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => undefined)
    return next
  }
}

function currentGeneration(
  state: PersistedState
): CalibrationGeneration | undefined {
  return (
    state.generations.find(
      (generation) => generation.id === state.settings.generationId
    ) ?? state.generations[0]
  )
}

function replaceGeneration(
  state: PersistedState,
  generation: CalibrationGeneration
): void {
  state.generations = [
    ...state.generations.filter((item) => item.id !== generation.id),
    generation
  ]
}

function validateFullHistoryScan(
  observedMessages: ObservedMessageRecord[],
  kind: 'measurement' | 'calibration'
): void {
  if (observedMessages.length === 0) {
    throw new Error(`${kind}_scan_empty`)
  }
  if (observedMessages.some((message) => message.role === 'unknown')) {
    throw new Error(`${kind}_parser_unreliable`)
  }
}

function fullHistorySnapshot(input: {
  existing: PersistedConversationLedger | undefined
  conversationKey: string
  generationId: string
  currentRevision: number
  environmentSignature: EnvironmentSignature
  uncertaintySources: UncertaintySource[]
  observedMessages: ObservedMessageRecord[]
  observedAt: number
  calibrationFailureFingerprint?: string
}): PersistedConversationLedger {
  const messages = input.observedMessages.map((message, index) => {
    const fingerprint = message.stableHintHash
      ? `stable:${message.stableHintHash}`
      : `scan:${index}:${message.contentFingerprint.slice(0, 16)}`
    return {
      fingerprint,
      contentFingerprint: message.contentFingerprint,
      ...(message.stableHintHash
        ? { stableHintHash: message.stableHintHash }
        : {}),
      role: message.role,
      tokenEstimate: message.tokenEstimate,
      observedAt: input.observedAt + index,
      ordinalHint: index,
      ...(message.attachmentCount !== undefined
        ? { attachmentCount: message.attachmentCount }
        : {})
    }
  })
  const activeFingerprints = messages.map((message) => message.fingerprint)
  const currentEstimatedLoad = messages.reduce(
    (sum, message) => sum + Math.max(0, message.tokenEstimate),
    0
  )
  const uncertaintySources = unique([
    ...input.uncertaintySources,
    ...(input.observedMessages.some(
      (message) => (message.attachmentCount ?? 0) > 0
    )
      ? (['attachment'] as const)
      : [])
  ])
  const sameGeneration = input.existing?.generationId === input.generationId
  const confirmedFailureFingerprints =
    input.calibrationFailureFingerprint
      ? unique([
          ...(sameGeneration
            ? input.existing?.confirmedFailureFingerprints ?? []
            : []),
          input.calibrationFailureFingerprint
        ])
      : sameGeneration
        ? input.existing?.confirmedFailureFingerprints ?? []
        : []

  return {
    conversationKey: input.conversationKey,
    generationId: input.generationId,
    ledgerRevision: input.currentRevision + 1,
    observationEpoch: input.observedAt,
    coverageState: 'complete',
    parserHealth: 'healthy',
    messages,
    activeFingerprints,
    sequenceReliability: 'reliable',
    currentEstimatedLoad,
    uncertaintySources,
    environmentSignature: input.environmentSignature,
    completedAssistantFingerprints:
      sameGeneration
        ? input.existing?.completedAssistantFingerprints ?? []
        : [],
    confirmedFailureFingerprints,
    dismissedFailureKeys:
      sameGeneration ? input.existing?.dismissedFailureKeys ?? [] : [],
    updatedAt: input.observedAt
  }
}

function riskFor(
  ledger: PersistedConversationLedger,
  generation: CalibrationGeneration,
  composerTokenEstimate: number
): RiskAssessment {
  const measurementState = deriveMeasurementState({
    supported: ledger.generationId === generation.id,
    ledger
  })
  const calibrationState = deriveCalibrationState({
    generation,
    currentEnvironment: ledger.environmentSignature
  })
  const environmentConfidence = deriveEnvironmentConfidence(
    generation.environmentSignature,
    ledger.environmentSignature
  )
  const summary = summarizeGeneration(generation)

  return assessRisk({
    currentLoad: ledger.currentEstimatedLoad,
    composerDraftLoad: Math.max(0, composerTokenEstimate),
    measurementState,
    calibrationState,
    environmentConfidence,
    ...(summary.failureReference
      ? { failureReference: summary.failureReference }
      : {}),
    ...(summary.growthReserveReady
      ? { growthReserve: summary.growthReserve }
      : {})
  })
}

function passiveConfirmedFailureKey(
  generationId: string,
  errorKind: ErrorKind
): string {
  return `${generationId}:${errorKind}:confirmed`
}

function calibrationFailureKey(
  generationId: string,
  scanSessionId: string
): string {
  return `${generationId}:calibration:${scanSessionId}`
}

function dismissedFailureKey(
  generationId: string,
  errorKind: ErrorKind
): string {
  return `${generationId}:${errorKind}:dismissed`
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function observationEquivalent(
  existing: PersistedConversationLedger,
  incoming: PersistedConversationLedger
): boolean {
  return (
    existing.generationId === incoming.generationId &&
    existing.coverageState === incoming.coverageState &&
    existing.parserHealth === incoming.parserHealth &&
    existing.sequenceReliability === incoming.sequenceReliability &&
    existing.sequenceUncertainReason === incoming.sequenceUncertainReason &&
    existing.currentEstimatedLoad === incoming.currentEstimatedLoad &&
    (existing.retainedPrefixLoad ?? 0) ===
      (incoming.retainedPrefixLoad ?? 0) &&
    sameStringSet(
      existing.uncertaintySources,
      incoming.uncertaintySources
    ) &&
    sameEnvironment(
      existing.environmentSignature,
      incoming.environmentSignature
    ) &&
    sameStrings(
      existing.activeFingerprints,
      incoming.activeFingerprints
    ) &&
    sameMessages(existing.messages, incoming.messages)
  )
}

function sameMessages(
  left: PersistedConversationLedger['messages'],
  right: PersistedConversationLedger['messages']
): boolean {
  if (left.length !== right.length) return false
  const rightByFingerprint = new Map(
    right.map((message) => [message.fingerprint, message])
  )
  return left.every((message) => {
    const other = rightByFingerprint.get(message.fingerprint)
    return (
      other !== undefined &&
      message.contentFingerprint === other.contentFingerprint &&
      message.stableHintHash === other.stableHintHash &&
      message.role === other.role &&
      message.tokenEstimate === other.tokenEstimate &&
      message.ordinalHint === other.ordinalHint &&
      message.hasCode === other.hasCode &&
      message.attachmentCount === other.attachmentCount
    )
  })
}

function sameEnvironment(
  left: PersistedConversationLedger['environmentSignature'],
  right: PersistedConversationLedger['environmentSignature']
): boolean {
  if (!left || !right) return left === right
  return (
    left.parserSchemaVersion === right.parserSchemaVersion &&
    left.measurementSchemaVersion === right.measurementSchemaVersion &&
    left.modelHint === right.modelHint
  )
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  )
}
