import type {
  CalibrationEvidenceSample,
  CalibrationGeneration,
  CoverageState,
  EmpiricalFailureReference,
  EnvironmentSignature,
  ErrorKind,
  EvidenceConfidence,
  FailureReferenceQuality,
  ParserHealth,
  PendingFailureConfirmation,
  SequenceReliability,
  TurnGrowthSample,
  UncertaintySource
} from './types'

export const CALIBRATION_DEFAULTS = {
  growthSampleLimit: 32,
  minimumGrowthSamples: 3,
  changePointSuggestionThreshold: 2,
  failureQuantile: 0.2,
  growthReserveQuantile: 0.8
} as const

export interface CalibrationSummary {
  safeEvidenceLoad?: number
  failureReference?: EmpiricalFailureReference
  provisionalFailureReference?: number
  growthReserve: number
  growthReserveReady: boolean
  confirmedSafeConversations: number
  confirmedFailureConversations: number
}

export interface SuccessObservation {
  conversationKey: string
  generationId: string
  estimatedLoad: number
  assistantFingerprint: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  sequenceReliability: SequenceReliability
  uncertaintySources: UncertaintySource[]
  environmentSignature?: EnvironmentSignature
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
  sequenceReliability: SequenceReliability
  uncertaintySources: UncertaintySource[]
  environmentSignature?: EnvironmentSignature
  observedAt: number
}

export interface ConfirmedFailureObservation extends Omit<FailureObservation, 'confidence'> {
  confidence?: 'high'
}

export function upsertConversationSample(
  generation: CalibrationGeneration,
  update: CalibrationEvidenceSample
): CalibrationGeneration {
  const existing = generation.samples.find(
    (sample) => sample.conversationKey === update.conversationKey
  )
  const merged: CalibrationEvidenceSample = {
    ...existing,
    ...update,
    uncertaintySources: unique([
      ...(existing?.uncertaintySources ?? []),
      ...(update.uncertaintySources ?? [])
    ]),
    updatedAt: Math.max(existing?.updatedAt ?? 0, update.updatedAt)
  }

  setIfDefined(
    merged,
    'highestConfirmedSafeLoad',
    maxDefined(existing?.highestConfirmedSafeLoad, update.highestConfirmedSafeLoad)
  )

  const failureEvidence = mergeFailureEvidence(existing, update)
  setIfDefined(merged, 'empiricalFailureLoad', failureEvidence.load)
  if (failureEvidence.quality) merged.failureReferenceQuality = failureEvidence.quality
  else delete merged.failureReferenceQuality

  setIfDefined(
    merged,
    'firstObservedAt',
    minDefined(existing?.firstObservedAt, update.firstObservedAt)
  )
  setIfDefined(
    merged,
    'lastObservedAt',
    maxDefined(existing?.lastObservedAt, update.lastObservedAt)
  )

  return {
    ...generation,
    samples: [
      ...generation.samples.filter((sample) => sample.conversationKey !== update.conversationKey),
      merged
    ]
  }
}

export function recordSuccessfulAssistantCompletion(
  generation: CalibrationGeneration,
  observation: SuccessObservation
): CalibrationGeneration {
  const usableSafe =
    observation.parserHealth === 'healthy' &&
    observation.coverageState === 'complete' &&
    observation.sequenceReliability === 'reliable'

  const summary = summarizeGeneration(generation)
  const strongCurrentReference =
    summary.failureReference?.quality === 'strong' ? summary.failureReference : undefined
  const conflict =
    usableSafe &&
    observation.uncertaintySources.length === 0 &&
    strongCurrentReference !== undefined &&
    observation.estimatedLoad >
      strongCurrentReference.load +
        (summary.growthReserveReady ? summary.growthReserve : 0)

  const environmentConflictKeys = conflict
    ? unique([
        ...generation.environmentConflictKeys,
        `safe:${observation.conversationKey}`
      ])
    : generation.environmentConflictKeys

  const next = upsertConversationSample(
    { ...generation, environmentConflictKeys },
    {
      conversationKey: observation.conversationKey,
      generationId: observation.generationId,
      ...(usableSafe ? { highestConfirmedSafeLoad: observation.estimatedLoad } : {}),
      coverageState: observation.coverageState,
      parserHealth: observation.parserHealth,
      sequenceReliability: observation.sequenceReliability,
      uncertaintySources: observation.uncertaintySources,
      ...(observation.environmentSignature
        ? { environmentSignature: observation.environmentSignature }
        : {}),
      firstObservedAt: observation.observedAt,
      lastObservedAt: observation.observedAt,
      updatedAt: observation.observedAt
    }
  )

  return {
    ...next,
    environmentConflictKeys,
    changePointSuggested:
      environmentConflictKeys.length >= CALIBRATION_DEFAULTS.changePointSuggestionThreshold
  }
}

export function recordTurnGrowth(
  generation: CalibrationGeneration,
  sample: TurnGrowthSample
): CalibrationGeneration {
  if (
    !Number.isFinite(sample.delta) ||
    sample.delta <= 0 ||
    sample.afterLoad < sample.beforeLoad
  ) {
    return generation
  }
  const turnGrowthSamples = [
    ...generation.turnGrowthSamples,
    sample
  ].slice(-CALIBRATION_DEFAULTS.growthSampleLimit)
  return { ...generation, turnGrowthSamples }
}

/**
 * Passive detection never establishes a usable failure reference by itself.
 * It only creates a confirmation request. Explicit calibration uses
 * recordConfirmedFailureReference directly.
 */
export function recordFailureObservation(
  generation: CalibrationGeneration,
  observation: FailureObservation
): CalibrationGeneration {
  if (observation.errorKind !== 'conversation_length_limit') return generation

  const pending: PendingFailureConfirmation = {
    conversationKey: observation.conversationKey,
    estimatedLoad: observation.estimatedLoad,
    errorKind: observation.errorKind,
    confidence: observation.confidence,
    coverageState: observation.coverageState,
    parserHealth: observation.parserHealth,
    sequenceReliability: observation.sequenceReliability,
    uncertaintySources: observation.uncertaintySources,
    ...(observation.environmentSignature
      ? { environmentSignature: observation.environmentSignature }
      : {}),
    observedAt: observation.observedAt
  }
  return {
    ...generation,
    pendingFailureConfirmations: upsertPending(
      generation.pendingFailureConfirmations,
      pending
    )
  }
}

export function recordConfirmedFailureReference(
  generation: CalibrationGeneration,
  observation: ConfirmedFailureObservation
): CalibrationGeneration {
  if (observation.errorKind !== 'conversation_length_limit') return generation

  const quality = failureQualityForObservation(observation)
  const summary = summarizeGeneration(generation)
  const currentStrong =
    summary.failureReference?.quality === 'strong' ? summary.failureReference : undefined
  const conflict =
    quality === 'strong' &&
    currentStrong !== undefined &&
    observation.estimatedLoad +
      (summary.growthReserveReady ? summary.growthReserve : 0) <
      currentStrong.load

  const environmentConflictKeys = conflict
    ? unique([
        ...generation.environmentConflictKeys,
        `failure:${observation.conversationKey}`
      ])
    : generation.environmentConflictKeys

  const next = upsertConversationSample(
    {
      ...generation,
      environmentConflictKeys,
      pendingFailureConfirmations: generation.pendingFailureConfirmations.filter(
        (item) => item.conversationKey !== observation.conversationKey
      )
    },
    {
      conversationKey: observation.conversationKey,
      generationId: observation.generationId,
      empiricalFailureLoad: observation.estimatedLoad,
      failureReferenceQuality: quality,
      coverageState: observation.coverageState,
      parserHealth: observation.parserHealth,
      sequenceReliability: observation.sequenceReliability,
      uncertaintySources: observation.uncertaintySources,
      ...(observation.environmentSignature
        ? { environmentSignature: observation.environmentSignature }
        : {}),
      firstObservedAt: observation.observedAt,
      lastObservedAt: observation.observedAt,
      updatedAt: observation.observedAt
    }
  )

  return {
    ...next,
    ...(quality !== 'provisional' && observation.environmentSignature
      ? { environmentSignature: observation.environmentSignature }
      : {}),
    environmentConflictKeys,
    changePointSuggested:
      environmentConflictKeys.length >= CALIBRATION_DEFAULTS.changePointSuggestionThreshold
  }
}

export function summarizeGeneration(
  generation: CalibrationGeneration
): CalibrationSummary {
  const safeSamples = generation.samples.filter(
    (sample) =>
      sample.highestConfirmedSafeLoad !== undefined &&
      sample.parserHealth === 'healthy' &&
      sample.coverageState === 'complete'
  )
  const safeEvidenceLoad = safeSamples.length
    ? Math.max(...safeSamples.map((sample) => sample.highestConfirmedSafeLoad!))
    : undefined

  const strongFailures = generation.samples.filter(
    (sample) =>
      sample.empiricalFailureLoad !== undefined &&
      sample.failureReferenceQuality === 'strong'
  )
  const conservativeFailures = generation.samples.filter(
    (sample) =>
      sample.empiricalFailureLoad !== undefined &&
      sample.failureReferenceQuality === 'conservative'
  )
  const provisionalFailures = generation.samples.filter(
    (sample) =>
      sample.empiricalFailureLoad !== undefined &&
      sample.failureReferenceQuality === 'provisional'
  )

  const selectedFailures =
    strongFailures.length > 0
      ? strongFailures
      : conservativeFailures.length > 0
        ? conservativeFailures
        : []
  const failureReference =
    selectedFailures.length > 0
      ? {
          load: robustQuantile(
            selectedFailures.map((sample) => sample.empiricalFailureLoad!),
            CALIBRATION_DEFAULTS.failureQuantile
          ),
          quality: (strongFailures.length > 0
            ? 'strong'
            : 'conservative') as EmpiricalFailureReference['quality'],
          sourceConversationCount: selectedFailures.length
        }
      : undefined

  const provisionalFailureReference =
    provisionalFailures.length > 0
      ? robustQuantile(
          provisionalFailures.map((sample) => sample.empiricalFailureLoad!),
          CALIBRATION_DEFAULTS.failureQuantile
        )
      : undefined

  const usableGrowth = generation.turnGrowthSamples.filter(
    (sample) =>
      !sample.uncertain &&
      Number.isFinite(sample.delta) &&
      sample.delta > 0
  )
  const growthReserveReady =
    usableGrowth.length >= CALIBRATION_DEFAULTS.minimumGrowthSamples
  const growthReserve =
    usableGrowth.length > 0
      ? nearestRankQuantile(
          usableGrowth.map((sample) => sample.delta),
          CALIBRATION_DEFAULTS.growthReserveQuantile
        )
      : 0

  return {
    ...(safeEvidenceLoad !== undefined ? { safeEvidenceLoad } : {}),
    ...(failureReference ? { failureReference } : {}),
    ...(provisionalFailureReference !== undefined
      ? { provisionalFailureReference }
      : {}),
    growthReserve: Math.max(0, Math.round(growthReserve)),
    growthReserveReady,
    confirmedSafeConversations: safeSamples.length,
    confirmedFailureConversations:
      strongFailures.length + conservativeFailures.length
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
    (priorSummary.safeEvidenceLoad !== undefined ||
      priorSummary.failureReference !== undefined)
      ? {
          sourceGenerationId: previous.id,
          ...(priorSummary.safeEvidenceLoad !== undefined
            ? { safeLoad: priorSummary.safeEvidenceLoad }
            : {}),
          ...(priorSummary.failureReference
            ? {
                failureReference: {
                  load: priorSummary.failureReference.load,
                  quality: priorSummary.failureReference.quality
                }
              }
            : {}),
          ...(previous.environmentSignature
            ? { environmentSignature: previous.environmentSignature }
            : {}),
          createdAt: now
        }
      : undefined

  return {
    id,
    createdAt: now,
    ...(previous ? { warmStartedFrom: previous.id } : {}),
    ...(warmStartPrior ? { warmStartPrior } : {}),
    samples: [],
    turnGrowthSamples: [],
    environmentConflictKeys: [],
    pendingFailureConfirmations: [],
    changePointSuggested: false
  }
}

export function failureQualityForObservation(
  observation: Pick<
    ConfirmedFailureObservation,
    'coverageState' | 'parserHealth' | 'sequenceReliability' | 'uncertaintySources'
  >
): FailureReferenceQuality {
  if (
    observation.coverageState !== 'complete' ||
    observation.parserHealth !== 'healthy' ||
    observation.sequenceReliability !== 'reliable'
  ) {
    return 'provisional'
  }
  return observation.uncertaintySources.length > 0 ? 'conservative' : 'strong'
}

function mergeFailureEvidence(
  existing: CalibrationEvidenceSample | undefined,
  update: CalibrationEvidenceSample
): {
  load?: number
  quality?: FailureReferenceQuality
} {
  const existingLoad = existing?.empiricalFailureLoad
  const updateLoad = update.empiricalFailureLoad
  const existingQuality =
    existingLoad === undefined
      ? undefined
      : normalizeFailureQuality(existing?.failureReferenceQuality)
  const updateQuality =
    updateLoad === undefined
      ? undefined
      : normalizeFailureQuality(update.failureReferenceQuality)

  if (updateLoad === undefined) {
    return existingLoad === undefined
      ? {}
      : { load: existingLoad, quality: existingQuality ?? 'provisional' }
  }
  if (existingLoad === undefined) {
    return { load: updateLoad, quality: updateQuality ?? 'provisional' }
  }

  const existingRank = failureQualityRank(existingQuality)
  const updateRank = failureQualityRank(updateQuality)
  if (existingRank > updateRank) {
    return { load: existingLoad, quality: existingQuality ?? 'provisional' }
  }
  if (updateRank > existingRank) {
    return { load: updateLoad, quality: updateQuality ?? 'provisional' }
  }
  return {
    load: Math.min(existingLoad, updateLoad),
    quality: existingQuality ?? updateQuality ?? 'provisional'
  }
}

function normalizeFailureQuality(
  quality: FailureReferenceQuality | undefined
): FailureReferenceQuality {
  if (quality === 'strong' || quality === 'conservative') return quality
  return 'provisional'
}

function failureQualityRank(
  quality: FailureReferenceQuality | undefined
): number {
  if (quality === 'strong') return 3
  if (quality === 'conservative') return 2
  return 1
}

function robustQuantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil(clamp(q, 0, 1) * sorted.length))
  return sorted[Math.min(sorted.length - 1, rank - 1)] ?? 0
}

function nearestRankQuantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil(clamp(q, 0, 1) * sorted.length))
  return sorted[Math.min(sorted.length - 1, rank - 1)] ?? 0
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

function unique<T>(values: T[]): T[] {
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

function setIfDefined<K extends keyof CalibrationEvidenceSample>(
  sample: CalibrationEvidenceSample,
  key: K,
  value: CalibrationEvidenceSample[K] | undefined
): void {
  if (value !== undefined) sample[key] = value
}
