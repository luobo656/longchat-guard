import type {
  CalibrationGeneration,
  ConversationBoundarySample,
  CoverageState,
  ErrorKind,
  EvidenceConfidence,
  ParserHealth,
  PendingFailureConfirmation
} from './types'

// Product defaults only; these are not OpenAI official limits or guarantees.
export const CALIBRATION_DEFAULTS = {
  targetIndependentConversations: 6,
  recentAssistantGrowthLimit: 24,
  incompleteSampleWeight: 0.45,
  mostlyCompleteSampleWeight: 0.75,
  contradictionConfidencePenalty: 0.45,
  suspiciousEarlyFailureRatio: 0.82,
  changePointSuggestionThreshold: 2,
  coldStartRiskStart: 24000,
  coldStartHighRisk: 36000,
  minConfirmedSafeConversationsForStrongWarning: 2
} as const

export interface CalibrationSummary {
  safeFloor?: number
  failureCeiling?: number
  estimatedRiskStart: number
  estimatedHighRisk: number
  confidence: number
  independentConversations: number
  confirmedSafeConversations: number
  safeFloorEvidenceReady: boolean
  contradictory: boolean
  suspiciousChangeCount: number
  changePointSuggested: boolean
  usingWarmStartPrior: boolean
  reasons: string[]
}

export interface SuccessObservation {
  conversationKey: string
  generationId: string
  estimatedLoad: number
  assistantTokenCount: number
  assistantFingerprint: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  observedAt: number
}

export interface FailureObservation {
  conversationKey: string
  generationId: string
  estimatedLoad: number
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  coverageState: CoverageState
  parserHealth: ParserHealth
  observedAt: number
}

export function upsertConversationSample(
  generation: CalibrationGeneration,
  update: ConversationBoundarySample
): CalibrationGeneration {
  const existing = generation.samples.find(
    (sample) => sample.conversationKey === update.conversationKey
  )
  const merged: ConversationBoundarySample = {
    ...existing,
    ...update,
    updatedAt: Math.max(existing?.updatedAt ?? 0, update.updatedAt)
  }
  setIfDefined(merged, 'highestConfirmedSafeLoad', maxDefined(existing?.highestConfirmedSafeLoad, update.highestConfirmedSafeLoad))
  setIfDefined(merged, 'firstConfirmedFailureLoad', minDefined(existing?.firstConfirmedFailureLoad, update.firstConfirmedFailureLoad))
  setIfDefined(merged, 'firstObservedAt', minDefined(existing?.firstObservedAt, update.firstObservedAt))
  setIfDefined(merged, 'lastObservedAt', maxDefined(existing?.lastObservedAt, update.lastObservedAt))
  const samples = generation.samples.filter(
    (sample) => sample.conversationKey !== update.conversationKey
  )
  samples.push(merged)

  const next = { ...generation, samples }
  return { ...next, confidence: summarizeGeneration(next).confidence }
}

export function recordSuccessfulAssistantCompletion(
  generation: CalibrationGeneration,
  observation: SuccessObservation
): CalibrationGeneration {
  const confirmedSafe =
    observation.coverageState === 'complete' && observation.parserHealth === 'healthy'
  const next = upsertConversationSample(generation, {
    conversationKey: observation.conversationKey,
    generationId: observation.generationId,
    ...(confirmedSafe ? { highestConfirmedSafeLoad: observation.estimatedLoad } : {}),
    coverageState: observation.coverageState,
    parserHealth: observation.parserHealth,
    successEvidenceQuality: confirmedSafe ? 'complete' : 'partial',
    firstObservedAt: observation.observedAt,
    lastObservedAt: observation.observedAt,
    updatedAt: observation.observedAt
  })
  return {
    ...next,
    verificationFactor: raiseVerificationFactor(next.verificationFactor),
    recentAssistantTokenCounts: appendLimited(
      next.recentAssistantTokenCounts ?? [],
      observation.assistantTokenCount,
      CALIBRATION_DEFAULTS.recentAssistantGrowthLimit
    )
  }
}

export function recordFailureObservation(
  generation: CalibrationGeneration,
  observation: FailureObservation
): CalibrationGeneration {
  if (observation.errorKind !== 'conversation_length_limit') return generation

  if (observation.confidence !== 'high') {
    const pending: PendingFailureConfirmation = {
      conversationKey: observation.conversationKey,
      estimatedLoad: observation.estimatedLoad,
      errorKind: observation.errorKind,
      confidence: observation.confidence,
      observedAt: observation.observedAt
    }
    return {
      ...generation,
      pendingFailureConfirmations: upsertPending(generation.pendingFailureConfirmations ?? [], pending)
    }
  }

  const before = summarizeGeneration(generation)
  const earlyFailure =
    before.failureCeiling !== undefined &&
    observation.estimatedLoad < before.estimatedRiskStart * CALIBRATION_DEFAULTS.suspiciousEarlyFailureRatio
  const suspiciousChangeCount = generation.suspiciousChangeCount + (earlyFailure ? 1 : 0)
  const next = upsertConversationSample(
    { ...generation, suspiciousChangeCount },
    {
      conversationKey: observation.conversationKey,
      generationId: observation.generationId,
      firstConfirmedFailureLoad: observation.estimatedLoad,
      coverageState: observation.coverageState,
      parserHealth: observation.parserHealth,
      failureEvidenceQuality: 'confirmed',
      firstObservedAt: observation.observedAt,
      lastObservedAt: observation.observedAt,
      updatedAt: observation.observedAt
    }
  )
  return {
    ...next,
    suspiciousChangeCount,
    verificationFactor: raiseVerificationFactor(next.verificationFactor),
    changePointSuggested:
      suspiciousChangeCount >= CALIBRATION_DEFAULTS.changePointSuggestionThreshold
  }
}

export function summarizeGeneration(
  generation: CalibrationGeneration
): CalibrationSummary {
  const weightedSafe = generation.samples
    .filter(isConfirmedSafeSample)
    .map((sample) => ({
      value: sample.highestConfirmedSafeLoad!,
      weight: sampleWeight(sample)
    }))
  const weightedFailures = generation.samples
    .filter((sample) => sample.firstConfirmedFailureLoad !== undefined)
    .map((sample) => ({
      value: sample.firstConfirmedFailureLoad!,
      weight: sampleWeight(sample)
    }))

  const safeValues = weightedSafe.map((sample) => sample.value)
  const failureValues = weightedFailures.map((sample) => sample.value)
  const safeFloor = safeValues.length ? Math.max(...safeValues) : undefined
  const failureCeiling = failureValues.length ? Math.min(...failureValues) : undefined
  const confirmedSafeConversations = weightedSafe.length
  const boundarySamples = generation.samples.filter(
    (sample) =>
      isConfirmedSafeSample(sample) || sample.firstConfirmedFailureLoad !== undefined
  )
  const independentConversations = boundarySamples.length
  const safeFloorEvidenceReady =
    confirmedSafeConversations >=
    CALIBRATION_DEFAULTS.minConfirmedSafeConversationsForStrongWarning
  const contradictory =
    safeFloor !== undefined && failureCeiling !== undefined && safeFloor > failureCeiling
  const reasons: string[] = []
  const usingWarmStartPrior =
    safeFloor === undefined &&
    failureCeiling === undefined &&
    generation.warmStartPrior !== undefined

  let estimatedRiskStart =
    weightedFailures.length > 0
      ? weightedQuantile(weightedFailures, 0.25)
      : safeFloor !== undefined
        ? safeFloor
        : generation.warmStartPrior?.estimatedRiskStart ??
          CALIBRATION_DEFAULTS.coldStartRiskStart
  let estimatedHighRisk =
    weightedFailures.length > 0
      ? weightedQuantile(weightedFailures, 0.6)
      : safeFloor !== undefined
        ? Math.max(safeFloor * 1.25, safeFloor + 3000)
        : generation.warmStartPrior?.estimatedHighRisk ??
          CALIBRATION_DEFAULTS.coldStartHighRisk

  if (failureCeiling !== undefined) {
    estimatedHighRisk = Math.min(estimatedHighRisk, failureCeiling)
    estimatedRiskStart = Math.min(estimatedRiskStart, Math.max(0, failureCeiling * 0.85))
  }
  if (contradictory) {
    reasons.push('contradictory_safe_and_failure_bounds')
    estimatedRiskStart = Math.min(estimatedRiskStart, failureCeiling ?? estimatedRiskStart)
    estimatedHighRisk = Math.min(estimatedHighRisk, failureCeiling ?? estimatedHighRisk)
  }
  if (!safeValues.length && !failureValues.length) {
    reasons.push(usingWarmStartPrior ? 'warm-start-prior' : 'cold-start')
  }

  const qualityWeight = boundarySamples.reduce(
    (total, sample) => total + sampleWeight(sample),
    0
  )
  const evidence =
    Math.min(qualityWeight / CALIBRATION_DEFAULTS.targetIndependentConversations, 1) * 0.5 +
    Math.min(weightedFailures.length / 2, 1) * 0.3 +
    Math.min(weightedSafe.length / 3, 1) * 0.2
  const verificationFactor = clamp(generation.verificationFactor ?? 1, 0.25, 1)
  const evidenceConfidence =
    evidence *
    verificationFactor *
    (contradictory ? CALIBRATION_DEFAULTS.contradictionConfidencePenalty : 1)
  const confidence = usingWarmStartPrior
    ? clamp(generation.warmStartPrior?.confidence ?? 0.05, 0.05, 0.35)
    : clamp(evidenceConfidence, 0.05, 0.95)

  return {
    ...(safeFloor !== undefined ? { safeFloor } : {}),
    ...(failureCeiling !== undefined ? { failureCeiling } : {}),
    estimatedRiskStart: Math.max(0, Math.round(estimatedRiskStart)),
    estimatedHighRisk: Math.max(0, Math.round(estimatedHighRisk)),
    confidence,
    independentConversations,
    confirmedSafeConversations,
    safeFloorEvidenceReady,
    contradictory,
    suspiciousChangeCount: generation.suspiciousChangeCount,
    changePointSuggested: generation.changePointSuggested ?? false,
    usingWarmStartPrior,
    reasons
  }
}

export function createGeneration(
  id: string,
  now: number,
  previous?: CalibrationGeneration
): CalibrationGeneration {
  const priorSummary = previous ? summarizeGeneration(previous) : undefined
  const warmStartPrior =
    previous &&
    priorSummary &&
    (priorSummary.safeFloor !== undefined || priorSummary.failureCeiling !== undefined)
      ? {
          sourceGenerationId: previous.id,
          estimatedRiskStart: priorSummary.estimatedRiskStart,
          estimatedHighRisk: priorSummary.estimatedHighRisk,
          confidence: Math.min(priorSummary.confidence * 0.45, 0.3),
          createdAt: now
        }
      : undefined

  return {
    id,
    createdAt: now,
    ...(previous ? { warmStartedFrom: previous.id } : {}),
    ...(warmStartPrior ? { warmStartPrior } : {}),
    samples: [],
    confidence: warmStartPrior?.confidence ?? 0.05,
    verificationFactor: 1,
    suspiciousChangeCount: 0,
    recentAssistantTokenCounts: previous?.recentAssistantTokenCounts?.slice(-6) ?? [],
    pendingFailureConfirmations: [],
    changePointSuggested: false
  }
}

export function archiveGeneration(
  generation: CalibrationGeneration,
  now: number
): CalibrationGeneration {
  return { ...generation, archivedAt: now }
}

export function reactivateGeneration(
  generation: CalibrationGeneration
): CalibrationGeneration {
  const { archivedAt: _archivedAt, ...rest } = generation
  return {
    ...rest,
    verificationFactor: Math.min(generation.verificationFactor ?? 1, 0.6)
  }
}

function isConfirmedSafeSample(sample: ConversationBoundarySample): boolean {
  if (sample.highestConfirmedSafeLoad === undefined) return false
  if (sample.successEvidenceQuality === 'partial') return false
  if (sample.coverageState !== 'complete') return false
  if (sample.parserHealth !== 'healthy') return false
  return sample.successEvidenceQuality === 'complete' || sample.successEvidenceQuality === undefined
}

function sampleWeight(sample: ConversationBoundarySample): number {
  let weight = 1
  if (sample.coverageState === 'incomplete' || sample.coverageState === 'unknown') {
    weight *= CALIBRATION_DEFAULTS.incompleteSampleWeight
  } else if (sample.coverageState === 'mostly_complete') {
    weight *= CALIBRATION_DEFAULTS.mostlyCompleteSampleWeight
  }
  if (sample.parserHealth === 'degraded') weight *= 0.7
  if (sample.parserHealth === 'unreliable') weight *= 0.25
  return weight
}

function weightedQuantile(values: Array<{ value: number; weight: number }>, q: number): number {
  const sorted = [...values].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, item) => sum + item.weight, 0)
  let seen = 0
  for (const item of sorted) {
    seen += item.weight
    if (seen >= total * clamp(q, 0, 1)) return item.value
  }
  return sorted.at(-1)?.value ?? 0
}

function appendLimited(values: number[], value: number, limit: number): number[] {
  return [...values, value].slice(-limit)
}

function upsertPending(
  pending: PendingFailureConfirmation[],
  item: PendingFailureConfirmation
): PendingFailureConfirmation[] {
  return [
    ...pending.filter((entry) => entry.conversationKey !== item.conversationKey),
    item
  ]
}

function maxDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

function minDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.min(a, b)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function raiseVerificationFactor(value?: number): number {
  return Math.min(1, (value ?? 1) + 0.2)
}

function setIfDefined<K extends keyof ConversationBoundarySample>(
  sample: ConversationBoundarySample,
  key: K,
  value: ConversationBoundarySample[K] | undefined
): void {
  if (value !== undefined) {
    sample[key] = value
  }
}
