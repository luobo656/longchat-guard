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
  recentAssistantGrowthLimit: 32,
  minConfirmedSafeConversationsForStable: 2,
  minIndependentBoundaryConversationsForStable: 4,
  changePointSuggestionThreshold: 2,
  failureQuantile: 0.2,
  turnBufferQuantile: 0.9
} as const

export interface CalibrationSummary {
  safeBoundary?: number
  failureBoundary?: number
  turnBuffer: number
  // 1.x aliases retained only for migration and compatibility.
  safeFloor?: number
  failureCeiling?: number
  estimatedRiskStart: number
  estimatedHighRisk: number
  confidence: number
  independentConversations: number
  confirmedSafeConversations: number
  confirmedFailureConversations: number
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
  const before = summarizeGeneration(generation)
  const confirmedSafe =
    observation.coverageState === 'complete' && observation.parserHealth === 'healthy'
  const conflict =
    confirmedSafe &&
    before.failureBoundary !== undefined &&
    before.turnBuffer > 0 &&
    observation.estimatedLoad > before.failureBoundary + before.turnBuffer
  const environmentConflictKeys = conflict
    ? unique([...(generation.environmentConflictKeys ?? []), `safe:${observation.conversationKey}`])
    : generation.environmentConflictKeys ?? []

  const next = upsertConversationSample(
    { ...generation, environmentConflictKeys },
    {
      conversationKey: observation.conversationKey,
      generationId: observation.generationId,
      ...(confirmedSafe ? { highestConfirmedSafeLoad: observation.estimatedLoad } : {}),
      coverageState: observation.coverageState,
      parserHealth: observation.parserHealth,
      successEvidenceQuality: confirmedSafe ? 'complete' : 'partial',
      firstObservedAt: observation.observedAt,
      lastObservedAt: observation.observedAt,
      updatedAt: observation.observedAt
    }
  )
  const recentAssistantTokenCounts =
    observation.assistantTokenCount > 0 && Number.isFinite(observation.assistantTokenCount)
      ? appendLimited(
          next.recentAssistantTokenCounts ?? [],
          observation.assistantTokenCount,
          CALIBRATION_DEFAULTS.recentAssistantGrowthLimit
        )
      : next.recentAssistantTokenCounts ?? []

  return {
    ...next,
    recentAssistantTokenCounts,
    environmentConflictKeys,
    suspiciousChangeCount: environmentConflictKeys.length,
    verificationFactor: raiseVerificationFactor(next.verificationFactor),
    changePointSuggested:
      environmentConflictKeys.length >= CALIBRATION_DEFAULTS.changePointSuggestionThreshold
  }
}

export function seedGrowthHistory(
  generation: CalibrationGeneration,
  conversationKey: string,
  tokenCounts: number[]
): CalibrationGeneration {
  const seeded = generation.growthHistoryConversationKeys ?? []
  if (seeded.includes(conversationKey)) return generation
  const valid = tokenCounts.filter((value) => Number.isFinite(value) && value > 0)
  return {
    ...generation,
    growthHistoryConversationKeys: unique([...seeded, conversationKey]),
    recentAssistantTokenCounts: [
      ...(generation.recentAssistantTokenCounts ?? []),
      ...valid
    ].slice(-CALIBRATION_DEFAULTS.recentAssistantGrowthLimit)
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
  const conflict =
    before.failureBoundary !== undefined &&
    before.turnBuffer > 0 &&
    observation.estimatedLoad + before.turnBuffer < before.failureBoundary
  const environmentConflictKeys = conflict
    ? unique([...(generation.environmentConflictKeys ?? []), `failure:${observation.conversationKey}`])
    : generation.environmentConflictKeys ?? []
  const next = upsertConversationSample(
    { ...generation, environmentConflictKeys },
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
    environmentConflictKeys,
    suspiciousChangeCount: environmentConflictKeys.length,
    verificationFactor: raiseVerificationFactor(next.verificationFactor),
    changePointSuggested:
      environmentConflictKeys.length >= CALIBRATION_DEFAULTS.changePointSuggestionThreshold
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
  const growthValues = (generation.recentAssistantTokenCounts ?? [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => ({ value, weight: 1 }))

  const safeBoundaryCurrent = weightedSafe.length
    ? Math.max(...weightedSafe.map((item) => item.value))
    : undefined
  const failureBoundaryCurrent = weightedFailures.length
    ? robustWeightedQuantile(weightedFailures, CALIBRATION_DEFAULTS.failureQuantile)
    : undefined
  const turnBufferCurrent = growthValues.length
    ? robustWeightedQuantile(growthValues, CALIBRATION_DEFAULTS.turnBufferQuantile)
    : 0

  const usingWarmStartPrior =
    safeBoundaryCurrent === undefined &&
    failureBoundaryCurrent === undefined &&
    generation.warmStartPrior !== undefined

  const turnBuffer =
    turnBufferCurrent > 0
      ? turnBufferCurrent
      : Math.max(0, generation.warmStartPrior?.turnBuffer ?? 0)
  const priorSafe = generation.warmStartPrior?.safeBoundary
  const priorFailure = generation.warmStartPrior?.failureBoundary
  const warmSafeContradicted =
    failureBoundaryCurrent !== undefined &&
    priorSafe !== undefined &&
    turnBuffer > 0 &&
    failureBoundaryCurrent + turnBuffer < priorSafe
  const warmFailureContradicted =
    safeBoundaryCurrent !== undefined &&
    priorFailure !== undefined &&
    turnBuffer > 0 &&
    safeBoundaryCurrent > priorFailure + turnBuffer
  const safeBoundary =
    safeBoundaryCurrent ?? (warmSafeContradicted ? undefined : priorSafe)
  const failureBoundary =
    failureBoundaryCurrent ?? (warmFailureContradicted ? undefined : priorFailure)

  const confirmedSafeConversations = weightedSafe.length
  const confirmedFailureConversations = weightedFailures.length
  const boundarySamples = generation.samples.filter(
    (sample) =>
      isConfirmedSafeSample(sample) || sample.firstConfirmedFailureLoad !== undefined
  )
  const independentConversations = boundarySamples.length
  const safeFloorEvidenceReady =
    confirmedSafeConversations >=
    CALIBRATION_DEFAULTS.minConfirmedSafeConversationsForStable
  const contradictory =
    safeBoundaryCurrent !== undefined &&
    failureBoundaryCurrent !== undefined &&
    safeBoundaryCurrent > failureBoundaryCurrent

  const reasons: string[] = []
  if (contradictory) reasons.push('contradictory_safe_and_failure_bounds')
  if (safeBoundaryCurrent === undefined && failureBoundaryCurrent === undefined) {
    reasons.push(usingWarmStartPrior ? 'warm-start-prior' : 'cold-start')
  }

  const estimatedRiskStart =
    failureBoundary !== undefined && turnBuffer > 0
      ? Math.max(0, failureBoundary - 3 * turnBuffer)
      : safeBoundary ?? generation.warmStartPrior?.estimatedRiskStart ?? 0
  const estimatedHighRisk =
    failureBoundary !== undefined && turnBuffer > 0
      ? Math.max(estimatedRiskStart, failureBoundary - turnBuffer)
      : failureBoundary ??
        generation.warmStartPrior?.estimatedHighRisk ??
        safeBoundary ??
        0

  const evidenceUnits = independentConversations + Math.min(growthValues.length / 4, 2)
  const verificationFactor = clamp(generation.verificationFactor ?? 1, 0.25, 1)
  const confidence = usingWarmStartPrior
    ? clamp(generation.warmStartPrior?.confidence ?? 0.05, 0.05, 0.35)
    : clamp((evidenceUnits / 6) * verificationFactor, 0.05, 0.95)

  return {
    ...(safeBoundary !== undefined ? { safeBoundary, safeFloor: safeBoundary } : {}),
    ...(failureBoundary !== undefined
      ? { failureBoundary, failureCeiling: failureBoundary }
      : {}),
    turnBuffer: Math.max(0, Math.round(turnBuffer)),
    estimatedRiskStart: Math.max(0, Math.round(estimatedRiskStart)),
    estimatedHighRisk: Math.max(0, Math.round(estimatedHighRisk)),
    confidence,
    independentConversations,
    confirmedSafeConversations,
    confirmedFailureConversations,
    safeFloorEvidenceReady,
    contradictory,
    suspiciousChangeCount: generation.environmentConflictKeys?.length ?? 0,
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
    (priorSummary.safeBoundary !== undefined || priorSummary.failureBoundary !== undefined)
      ? {
          sourceGenerationId: previous.id,
          ...(priorSummary.safeBoundary !== undefined
            ? { safeBoundary: priorSummary.safeBoundary }
            : {}),
          ...(priorSummary.failureBoundary !== undefined
            ? { failureBoundary: priorSummary.failureBoundary }
            : {}),
          ...(priorSummary.turnBuffer > 0
            ? { turnBuffer: priorSummary.turnBuffer }
            : {}),
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
    recentAssistantTokenCounts: previous?.recentAssistantTokenCounts?.slice(-8) ?? [],
    growthHistoryConversationKeys: [],
    environmentConflictKeys: [],
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
    weight *= 0.45
  } else if (sample.coverageState === 'mostly_complete') {
    weight *= 0.75
  }
  if (sample.parserHealth === 'degraded') weight *= 0.7
  if (sample.parserHealth === 'unreliable') weight *= 0.25
  return weight
}

function robustWeightedQuantile(
  values: Array<{ value: number; weight: number }>,
  q: number
): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]!.value

  const sorted = [...values]
    .filter((item) => item.weight > 0)
    .sort((a, b) => a.value - b.value)
  if (sorted.length === 1) return sorted[0]!.value

  const total = sorted.reduce((sum, item) => sum + item.weight, 0)
  const target = clamp(q, 0, 1)
  const centers: Array<{ position: number; value: number }> = []
  let cumulative = 0
  for (const item of sorted) {
    const center = (cumulative + item.weight / 2) / total
    centers.push({ position: center, value: item.value })
    cumulative += item.weight
  }

  if (target <= centers[0]!.position) return centers[0]!.value
  if (target >= centers.at(-1)!.position) return centers.at(-1)!.value

  for (let index = 1; index < centers.length; index += 1) {
    const left = centers[index - 1]!
    const right = centers[index]!
    if (target > right.position) continue
    const span = Math.max(right.position - left.position, Number.EPSILON)
    const ratio = (target - left.position) / span
    return left.value + (right.value - left.value) * ratio
  }
  return centers.at(-1)!.value
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
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
