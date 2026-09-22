import type { RiskAssessment, RiskInput, RiskLevel } from './types'

// Product defaults only; these are not OpenAI official percentages or limits.
const COVERAGE_PENALTY = {
  complete: 0,
  mostly_complete: 8,
  incomplete: 18,
  unknown: 24
} as const

// Product heuristics only; these are not OpenAI official limits or percentages.
const COLD_START_MAX_SCORE = 66
const SAFE_FLOOR_ONLY_MAX_SCORE = 81
const RELIABLE_WITHIN_SAFE_FLOOR_MAX_SCORE = 47

export function assessRisk(input: RiskInput): RiskAssessment {
  const predicted = predictedLoad(input)
  if (input.parserHealth === 'unreliable') {
    return {
      level: 'unreliable',
      predictedNextTurnLoad: predicted,
      score: 100,
      reasons: ['page_adapter_unreliable']
    }
  }

  const reasons: string[] = []
  const hasSafeFloor = input.safeFloor !== undefined
  const hasFailureCeiling = input.failureCeiling !== undefined
  const contradictory =
    hasFailureCeiling &&
    hasSafeFloor &&
    input.safeFloor! > input.failureCeiling!
  let score = 8
  let cap = 100
  let reliableWithinSafeFloor = false

  if (hasFailureCeiling) {
    const failureCeiling = input.failureCeiling!
    const riskStart = input.estimatedRiskStart ?? Math.max(0, failureCeiling * 0.85)
    const highRisk = input.estimatedHighRisk ?? failureCeiling
    reasons.push('confirmed_failure_boundary')

    if (predicted >= failureCeiling) {
      score = 90
      reasons.push('predicted_load_reaches_failure_ceiling')
    } else if (predicted < riskStart) {
      score = 18
      reasons.push('below_calibrated_risk_start')
    } else {
      score = 44 + scaledBetween(predicted, riskStart, highRisk) * 36
      reasons.push('calibrated_estimated_risk_band')
    }
  } else if (hasSafeFloor) {
    const safeFloor = input.safeFloor!
    const riskStart = Math.max(input.estimatedRiskStart ?? safeFloor, safeFloor)
    const highRisk = Math.max(input.estimatedHighRisk ?? safeFloor * 1.25, riskStart + 1)
    cap = input.safeFloorEvidenceReady
      ? SAFE_FLOOR_ONLY_MAX_SCORE
      : COLD_START_MAX_SCORE
    reasons.push('safe_floor_only')
    if (!input.safeFloorEvidenceReady) reasons.push('safe_floor_evidence_learning')

    if (predicted <= safeFloor) {
      score = 18
      reasons.push('within_confirmed_safe_floor')
      reliableWithinSafeFloor =
        input.coverage === 'complete' &&
        input.parserHealth === 'healthy' &&
        !contradictory
    } else {
      score = 44 + scaledBetween(predicted, riskStart, highRisk) * 30
      reasons.push('predicted_load_exceeds_safe_floor')
    }
  } else if (
    input.usingWarmStartPrior &&
    input.estimatedRiskStart !== undefined &&
    input.estimatedHighRisk !== undefined
  ) {
    score =
      18 +
      scaledBetween(predicted, input.estimatedRiskStart, input.estimatedHighRisk) * 32
    reasons.push('warm-start-prior')
    cap = COLD_START_MAX_SCORE
  } else {
    score += Math.min(predicted / 4000, 35)
    reasons.push('cold-start')
    cap = COLD_START_MAX_SCORE
  }

  if (contradictory) {
    score += 12
    reasons.push('contradictory_calibration_bounds')
  }
  if ((input.suspiciousChangeCount ?? 0) > 0) {
    score += Math.min((input.suspiciousChangeCount ?? 0) * 10, 20)
    reasons.push('suspicious_early_failure_signal')
  }
  if (input.changePointSuggested) {
    score += 8
    reasons.push('change_point_suggested')
  }

  score += COVERAGE_PENALTY[input.coverage]
  if (input.coverage !== 'complete') reasons.push('coverage_incomplete')
  if (input.parserHealth === 'degraded') {
    score += 10
    reasons.push('parser_degraded')
  }
  score += (1 - clamp01(input.confidence)) * 10
  score += clamp(input.feedbackBias ?? 0, -6, 6)
  if ((input.feedbackBias ?? 0) !== 0) reasons.push('user_feedback_bias')

  if (reliableWithinSafeFloor) {
    cap = Math.min(cap, RELIABLE_WITHIN_SAFE_FLOOR_MAX_SCORE)
  }
  score = clamp(score, 0, cap)

  return {
    level: levelFromScore(score),
    predictedNextTurnLoad: predicted,
    score,
    reasons
  }
}

function predictedLoad(input: RiskInput): number {
  return Math.max(
    0,
    input.currentLoad +
      input.composerLoad +
      input.expectedAssistantGrowth +
      input.safetyMargin
  )
}

function scaledBetween(value: number, start: number, high: number): number {
  if (high <= start) return value >= high ? 1 : 0
  return clamp((value - start) / (high - start), 0, 1)
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 82) return 'high'
  if (score >= 67) return 'organize'
  if (score >= 48) return 'long'
  return 'normal'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
