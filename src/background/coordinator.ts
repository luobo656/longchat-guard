import { loadState, saveState, mergeLedgerSnapshots, withPrivacyConsent, type LocalStorageArea, type PersistedState } from '../core/storage'
import { reconcileSequence, type TailEvidence } from '../core/sequence-reconciler'
import {
  recordFailureObservation,
  recordSuccessfulAssistantCompletion,
  summarizeGeneration
} from '../core/calibration'
import { assessRisk } from '../core/risk-engine'
import {
  clearLearningData,
  restoreGeneration as restoreGenerationState,
  startNewGeneration
} from '../core/generation-manager'
import type {
  CalibrationGeneration,
  ConversationControl,
  CoverageState,
  ErrorKind,
  EvidenceConfidence,
  FeedbackKind,
  ObservedMessageRecord,
  ParserHealth,
  PersistedConversationLedger,
  RiskAssessment
} from '../core/types'

export interface ObservedConversationWindow {
  conversationKey: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  tailEvidence: TailEvidence
  observedMessages: ObservedMessageRecord[]
  composerTokenEstimate: number
  observedAt: number
}

export interface CompletionEvent {
  conversationKey: string
  assistantFingerprint: string
  estimatedLoad: number
  assistantTokenCount: number
  observedAt: number
}

export interface FailureEvent {
  conversationKey: string
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  composerTokenEstimate: number
  observedAt: number
}

export type BackgroundRequest =
  | { type: 'guard.loadState' }
  | { type: 'guard.upsertLedger'; snapshot: PersistedConversationLedger }
  | { type: 'guard.observeWindow'; window: ObservedConversationWindow }
  | { type: 'guard.recordCompletion'; event: CompletionEvent }
  | { type: 'guard.recordFailure'; event: FailureEvent }
  | { type: 'guard.startGeneration'; reason: 'environment_change' | 'recalibrate'; observedAt: number }
  | { type: 'guard.restoreGeneration'; generationId: string; observedAt: number }
  | { type: 'guard.clearLearning'; observedAt: number }
  | { type: 'guard.confirmPendingFailure'; conversationKey: string; accepted: boolean; observedAt: number }
  | { type: 'guard.updateControl'; conversationKey: string; patch: Partial<ConversationControl> }
  | { type: 'guard.recordFeedback'; feedback: FeedbackKind }
  | { type: 'guard.updatePrivacyConsent'; accepted: boolean; observedAt: number }

export type BackgroundResponse =
  | { ok: true; state: PersistedState; snapshot?: PersistedConversationLedger; risk?: RiskAssessment }
  | { ok: false; error: string }

export class StorageMutationCoordinator {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: LocalStorageArea) {}

  loadState(): Promise<PersistedState> {
    return this.enqueue(() => loadState(this.storage))
  }

  upsertLedger(snapshot: PersistedConversationLedger): Promise<{
    state: PersistedState
    snapshot: PersistedConversationLedger
  }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const generationId = state.settings.generationId
      const existing = state.ledgers[snapshot.conversationKey]
      const normalizedIncoming: PersistedConversationLedger = {
        ...snapshot,
        generationId,
        coverageState:
          existing?.coverageState === 'complete' || snapshot.coverageState === 'complete'
            ? 'complete'
            : snapshot.coverageState
      }
      const merged = mergeLedgerSnapshots(existing, normalizedIncoming)
      state.ledgers[snapshot.conversationKey] = merged
      await saveState(this.storage, state)
      return { state, snapshot: merged }
    })
  }

  observeWindow(window: ObservedConversationWindow): Promise<{
    state: PersistedState
    snapshot: PersistedConversationLedger
    risk: RiskAssessment
  }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const generationId = state.settings.generationId
      const existing = state.ledgers[window.conversationKey]
      const reconcileResult = reconcileSequence({
        existingMessages: existing?.messages ?? [],
        activeFingerprints: existing?.activeFingerprints ?? [],
        observed: window.observedMessages,
        tailEvidence: window.tailEvidence,
        coverageState:
          existing?.coverageState === 'complete' || window.coverageState === 'complete'
            ? 'complete'
            : window.coverageState,
        parserHealth: window.parserHealth,
        now: window.observedAt
      })
      const currentEstimatedLoad = reconcileResult.activeFingerprints.reduce((total, fingerprint) => {
        return total + (reconcileResult.messages.find((message) => message.fingerprint === fingerprint)?.tokenEstimate ?? 0)
      }, 0)
      const snapshot: PersistedConversationLedger = {
        conversationKey: window.conversationKey,
        generationId,
        coverageState: reconcileResult.coverageState,
        parserHealth: reconcileResult.parserHealth,
        messages: reconcileResult.messages,
        activeFingerprints: reconcileResult.activeFingerprints,
        sequenceReliability: reconcileResult.reliability,
        currentEstimatedLoad,
        updatedAt: window.observedAt
      }
      if (reconcileResult.uncertainReason) {
        snapshot.sequenceUncertainReason = reconcileResult.uncertainReason
      }
      state.ledgers[window.conversationKey] = snapshot
      const generation = currentGeneration(state)
      if (!generation) throw new Error('missing_generation')
      const risk = riskFor(snapshot, generation, window.composerTokenEstimate)
      await saveState(this.storage, state)
      return { state, snapshot, risk }
    })
  }

  recordCompletion(event: CompletionEvent): Promise<{ state: PersistedState; risk?: RiskAssessment }> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const ledger = state.ledgers[event.conversationKey]
      const generation = currentGeneration(state)
      if (!ledger || !generation) return { state }
      if (ledger.completedAssistantFingerprints?.includes(event.assistantFingerprint)) {
        return { state, risk: riskFor(ledger, generation, 0) }
      }
      ledger.completedAssistantFingerprints = [
        ...(ledger.completedAssistantFingerprints ?? []),
        event.assistantFingerprint
      ]
      const updatedGeneration = recordSuccessfulAssistantCompletion(generation, {
        conversationKey: event.conversationKey,
        generationId: generation.id,
        estimatedLoad: event.estimatedLoad,
        assistantTokenCount: event.assistantTokenCount,
        assistantFingerprint: event.assistantFingerprint,
        coverageState: ledger.coverageState,
        parserHealth: ledger.parserHealth,
        observedAt: event.observedAt
      })
      replaceGeneration(state, updatedGeneration)
      await saveState(this.storage, state)
      return { state, risk: riskFor(ledger, updatedGeneration, 0) }
    })
  }

  recordFailure(event: FailureEvent): Promise<{ state: PersistedState; risk?: RiskAssessment }> {
    return this.enqueue(async () => {
      let state = await loadState(this.storage)
      const ledger = state.ledgers[event.conversationKey]
      const generation = currentGeneration(state)
      if (!ledger || !generation) return { state }

      const estimatedLoad = ledger.currentEstimatedLoad + event.composerTokenEstimate
      const confirmedKey = confirmedFailureKey(generation.id, event.errorKind)
      const dismissedKey = dismissedFailureKey(generation.id, event.errorKind, estimatedLoad)
      if (ledger.confirmedFailureFingerprints?.includes(confirmedKey)) {
        return { state, risk: riskFor(ledger, generation, event.composerTokenEstimate) }
      }
      if (
        event.confidence !== 'high' &&
        ledger.dismissedFailureKeys?.includes(dismissedKey)
      ) {
        return { state, risk: riskFor(ledger, generation, event.composerTokenEstimate) }
      }

      const observation = {
        conversationKey: event.conversationKey,
        generationId: generation.id,
        estimatedLoad,
        errorKind: event.errorKind,
        confidence: event.confidence,
        coverageState: ledger.coverageState,
        parserHealth: ledger.parserHealth,
        observedAt: event.observedAt
      } as const
      const updatedGeneration = recordFailureObservation(generation, observation)

      if (event.errorKind === 'conversation_length_limit' && event.confidence === 'high') {
        ledger.confirmedFailureFingerprints = unique([
          ...(ledger.confirmedFailureFingerprints ?? []),
          confirmedKey
        ])
      }
      replaceGeneration(state, updatedGeneration)

      if (
        event.errorKind === 'conversation_length_limit' &&
        event.confidence === 'high' &&
        updatedGeneration.changePointSuggested
      ) {
        state = rollToAutoChangeGeneration(state, observation)
        const activeGeneration = currentGeneration(state)
        if (!activeGeneration) throw new Error('missing_generation_after_auto_change')
        ledger.generationId = activeGeneration.id
        ledger.confirmedFailureFingerprints = unique([
          ...(ledger.confirmedFailureFingerprints ?? []),
          confirmedFailureKey(activeGeneration.id, event.errorKind)
        ])
        state.ledgers[event.conversationKey] = ledger
        await saveState(this.storage, state)
        return { state, risk: riskFor(ledger, activeGeneration, event.composerTokenEstimate) }
      }

      await saveState(this.storage, state)
      return { state, risk: riskFor(ledger, updatedGeneration, event.composerTokenEstimate) }
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

  restoreGeneration(generationId: string, observedAt: number): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const next = restoreGenerationState(state, generationId, observedAt)
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
      let state = await loadState(this.storage)
      const generation = currentGeneration(state)
      const ledger = state.ledgers[conversationKey]
      if (!generation || !ledger) return { state }

      const pending = generation.pendingFailureConfirmations?.find(
        (item) => item.conversationKey === conversationKey
      )
      if (!pending) return { state, risk: riskFor(ledger, generation, 0) }

      let updatedGeneration: CalibrationGeneration = {
        ...generation,
        pendingFailureConfirmations: (generation.pendingFailureConfirmations ?? []).filter(
          (item) => item.conversationKey !== conversationKey
        )
      }

      if (!accepted) {
        ledger.dismissedFailureKeys = unique([
          ...(ledger.dismissedFailureKeys ?? []),
          dismissedFailureKey(generation.id, pending.errorKind, pending.estimatedLoad)
        ])
        replaceGeneration(state, updatedGeneration)
        await saveState(this.storage, state)
        return { state, risk: riskFor(ledger, updatedGeneration, 0) }
      }

      const observation = {
        conversationKey,
        generationId: generation.id,
        estimatedLoad: pending.estimatedLoad,
        errorKind: pending.errorKind,
        confidence: 'high' as const,
        coverageState: ledger.coverageState,
        parserHealth: ledger.parserHealth,
        observedAt
      }
      updatedGeneration = recordFailureObservation(updatedGeneration, observation)
      ledger.confirmedFailureFingerprints = unique([
        ...(ledger.confirmedFailureFingerprints ?? []),
        confirmedFailureKey(generation.id, pending.errorKind)
      ])
      replaceGeneration(state, updatedGeneration)

      if (updatedGeneration.changePointSuggested) {
        state = rollToAutoChangeGeneration(state, observation)
        const activeGeneration = currentGeneration(state)
        if (!activeGeneration) throw new Error('missing_generation_after_auto_change')
        ledger.generationId = activeGeneration.id
        ledger.confirmedFailureFingerprints = unique([
          ...(ledger.confirmedFailureFingerprints ?? []),
          confirmedFailureKey(activeGeneration.id, pending.errorKind)
        ])
        state.ledgers[conversationKey] = ledger
        await saveState(this.storage, state)
        return { state, risk: riskFor(ledger, activeGeneration, 0) }
      }

      await saveState(this.storage, state)
      return { state, risk: riskFor(ledger, updatedGeneration, 0) }
    })
  }

  updateControl(
    conversationKey: string,
    patch: Partial<ConversationControl>
  ): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      state.conversationControls[conversationKey] = {
        ...(state.conversationControls[conversationKey] ?? {}),
        ...patch
      }
      await saveState(this.storage, state)
      return state
    })
  }

  recordFeedback(feedback: FeedbackKind): Promise<PersistedState> {
    return this.enqueue(async () => {
      const state = await loadState(this.storage)
      const generation = currentGeneration(state)
      if (!generation) return state
      const current = generation.feedbackBias ?? 0
      const nextBias =
        feedback === 'too_early'
          ? current - 2
          : feedback === 'too_late'
            ? current + 2
            : current > 0
              ? current - 1
              : current < 0
                ? current + 1
                : 0
      replaceGeneration(state, {
        ...generation,
        feedbackBias: Math.max(-6, Math.min(6, nextBias))
      })
      await saveState(this.storage, state)
      return state
    })
  }

  updatePrivacyConsent(accepted: boolean, observedAt: number): Promise<PersistedState> {
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

function rollToAutoChangeGeneration(
  state: PersistedState,
  observation: {
    conversationKey: string
    estimatedLoad: number
    errorKind: ErrorKind
    coverageState: CoverageState
    parserHealth: ParserHealth
    observedAt: number
  }
): PersistedState {
  const rolled = startNewGeneration(state, 'auto_change', observation.observedAt)
  const generation = currentGeneration(rolled)
  if (!generation) throw new Error('missing_generation_after_auto_change')
  const seeded = recordFailureObservation(generation, {
    ...observation,
    generationId: generation.id,
    confidence: 'high'
  })
  replaceGeneration(rolled, seeded)
  return rolled
}

function confirmedFailureKey(generationId: string, errorKind: ErrorKind): string {
  return `${generationId}:${errorKind}:confirmed`
}

function dismissedFailureKey(
  generationId: string,
  errorKind: ErrorKind,
  estimatedLoad: number
): string {
  return `${generationId}:${errorKind}:${Math.round(estimatedLoad)}`
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function currentGeneration(state: PersistedState) {
  return state.generations.find((generation) => generation.id === state.settings.generationId) ?? state.generations[0]
}

function replaceGeneration(state: PersistedState, generation: NonNullable<ReturnType<typeof currentGeneration>>): void {
  state.generations = [
    ...state.generations.filter((item) => item.id !== generation.id),
    generation
  ]
}

function riskFor(
  ledger: PersistedConversationLedger,
  generation: NonNullable<ReturnType<typeof currentGeneration>>,
  _composerTokenEstimate: number
): RiskAssessment {
  const summary = summarizeGeneration(generation)
  const input = {
    currentLoad: ledger.currentEstimatedLoad,
    composerLoad: 0,
    expectedAssistantGrowth: 0,
    safetyMargin: 0,
    coverage: ledger.coverageState,
    parserHealth: ledger.parserHealth,
    confidence: summary.confidence
  }
  return assessRisk({
    ...input,
    ...(summary.safeFloor !== undefined ? { safeFloor: summary.safeFloor } : {}),
    safeFloorEvidenceReady: summary.safeFloorEvidenceReady,
    ...(summary.failureCeiling !== undefined ? { failureCeiling: summary.failureCeiling } : {}),
    estimatedRiskStart: summary.estimatedRiskStart,
    estimatedHighRisk: summary.estimatedHighRisk,
    suspiciousChangeCount: summary.suspiciousChangeCount,
    changePointSuggested: summary.changePointSuggested,
    usingWarmStartPrior: summary.usingWarmStartPrior,
    feedbackBias: generation.feedbackBias ?? 0
  })
}
