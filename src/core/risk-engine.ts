import type { RiskAssessment, RiskInput, RiskState } from './types'
import {
  calibrationIsUsable,
  measurementIsUsable
} from './product-state'

const SEVERITY_SCORE: Record<RiskState, number> = {
  unknown: 0,
  normal: 20,
  long: 55,
  organize: 72,
  high: 90
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const currentLoad = Math.max(0, input.currentLoad)
  const composerDraftLoad = Math.max(0, input.composerDraftLoad)
  const baseLoad = currentLoad + composerDraftLoad
  const reasons: string[] = []

  if (!measurementIsUsable(input.measurementState)) {
    reasons.push(`measurement_${input.measurementState}`)
    return unknownAssessment(baseLoad, reasons)
  }

  if (!calibrationIsUsable(input.calibrationState)) {
    reasons.push(`calibration_${input.calibrationState}`)
    return unknownAssessment(baseLoad, reasons)
  }

  const failureReference = input.failureReference
  if (!failureReference || failureReference.load <= 0) {
    reasons.push('missing_empirical_failure_reference')
    return unknownAssessment(baseLoad, reasons)
  }

  if (failureReference.quality === 'conservative') {
    reasons.push('conservative_failure_reference')
  } else {
    reasons.push('strong_failure_reference')
  }

  if (composerDraftLoad > 0) reasons.push('composer_draft_included')

  const reserve =
    input.growthReserve !== undefined && input.growthReserve > 0
      ? input.growthReserve
      : 0
  const referenceLoad = failureReference.load
  const projectedLoad = baseLoad + reserve

  let state: Exclude<RiskState, 'unknown'> = 'normal'

  if (reserve > 0) {
    reasons.push('turn_growth_reserve_ready')
    if (baseLoad + reserve >= referenceLoad) {
      state = 'high'
      reasons.push('projected_next_turn_reaches_reference')
    } else if (baseLoad + 2 * reserve >= referenceLoad) {
      state = 'organize'
      reasons.push('within_two_turn_growth_reserves')
    } else if (baseLoad + 3 * reserve >= referenceLoad) {
      state = 'long'
      reasons.push('within_three_turn_growth_reserves')
    }
  } else {
    reasons.push('turn_growth_reserve_learning')
    if (baseLoad >= referenceLoad) {
      state = 'high'
      reasons.push('at_or_above_failure_reference')
    }
  }

  const referencePositionScore = computeReferencePositionScore(
    baseLoad,
    referenceLoad
  )

  if (input.environmentConfidence === 'mismatch') {
    reasons.push('environment_mismatch')
    return unknownAssessment(projectedLoad, reasons)
  }

  return {
    state,
    score: SEVERITY_SCORE[state],
    referencePositionScore,
    projectedLoad,
    reasons
  }
}

function unknownAssessment(
  projectedLoad: number,
  reasons: string[],
  referencePositionScore = 0
): RiskAssessment {
  return {
    state: 'unknown',
    score: SEVERITY_SCORE.unknown,
    referencePositionScore,
    projectedLoad,
    reasons
  }
}

function computeReferencePositionScore(
  load: number,
  failureReference: number
): number {
  if (load <= 0 || failureReference <= 0) return 0
  return clamp((load / failureReference) * 100, 0, 100)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
