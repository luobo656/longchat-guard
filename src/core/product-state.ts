import type {
  CalibrationGeneration,
  CalibrationState,
  EnvironmentConfidence,
  EnvironmentSignature,
  MeasurementState,
  PersistedConversationLedger
} from './types'
import { summarizeGeneration } from './calibration'

export function deriveMeasurementState(input: {
  supported: boolean
  ledger?: PersistedConversationLedger
}): MeasurementState {
  if (!input.supported || !input.ledger) return 'unavailable'
  const ledger = input.ledger
  if (
    ledger.parserHealth !== 'healthy' ||
    ledger.sequenceReliability === 'uncertain'
  ) {
    return 'uncertain'
  }
  if (ledger.coverageState === 'complete') return 'complete'
  if (
    ledger.coverageState === 'mostly_complete' ||
    ledger.coverageState === 'incomplete'
  ) {
    return 'partial'
  }
  return 'uncertain'
}

export type EnvironmentComparison =
  | 'match'
  | 'unknown'
  | 'mismatch'

export function compareEnvironmentSignatures(
  calibrated: EnvironmentSignature | undefined,
  current: EnvironmentSignature | undefined
): EnvironmentComparison {
  if (!calibrated || !current) return 'unknown'
  if (calibrated.parserSchemaVersion !== current.parserSchemaVersion) {
    return 'mismatch'
  }
  if (calibrated.measurementSchemaVersion !== current.measurementSchemaVersion) {
    return 'mismatch'
  }
  return 'match'
}

export function environmentSignaturesMatch(
  calibrated: EnvironmentSignature | undefined,
  current: EnvironmentSignature | undefined
): boolean {
  return compareEnvironmentSignatures(calibrated, current) === 'match'
}

export function deriveEnvironmentConfidence(
  calibrated: EnvironmentSignature | undefined,
  current: EnvironmentSignature | undefined
): EnvironmentConfidence {
  const comparison = compareEnvironmentSignatures(calibrated, current)
  if (comparison === 'match') return 'verified'
  if (comparison === 'mismatch') return 'mismatch'
  return 'unverified'
}

export function deriveCalibrationState(input: {
  generation?: CalibrationGeneration | undefined
  currentEnvironment?: EnvironmentSignature | undefined
  calibrating?: boolean
}): CalibrationState {
  if (input.calibrating) return 'calibrating'
  const generation = input.generation
  if (!generation) return 'uncalibrated'
  const summary = summarizeGeneration(generation)
  const hasHistoricalPrior =
    generation.warmStartPrior?.failureReference !== undefined ||
    summary.provisionalFailureReference !== undefined
  if (!summary.failureReference) {
    return hasHistoricalPrior ? 'stale' : 'uncalibrated'
  }
  if (generation.changePointSuggested) return 'stale'

  const environmentComparison = compareEnvironmentSignatures(
    generation.environmentSignature,
    input.currentEnvironment
  )
  if (environmentComparison === 'mismatch') return 'stale'
  if (environmentComparison === 'unknown') return 'environment_unknown'
  return summary.failureReference.quality === 'conservative'
    ? 'calibrated_conservative'
    : 'calibrated'
}

export function calibrationIsUsable(state: CalibrationState): boolean {
  return state === 'calibrated' || state === 'calibrated_conservative'
}

export function calibrationNeedsFreshGeneration(input: {
  generation?: CalibrationGeneration | undefined
  currentEnvironment?: EnvironmentSignature | undefined
}): boolean {
  if (!input.generation) return false
  if (
    deriveCalibrationState({
      generation: input.generation,
      currentEnvironment: input.currentEnvironment
    }) !== 'stale'
  ) {
    return false
  }
  return Boolean(summarizeGeneration(input.generation).failureReference)
}

export function measurementIsUsable(state: MeasurementState): boolean {
  return state === 'complete'
}
