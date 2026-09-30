import type { RiskAssessment, RiskInput, RiskLevel } from './types'

const SEVERITY_SCORE: Record<Exclude<RiskLevel, 'unreliable'>, number> = {
  normal: 20,
  long: 55,
  organize: 72,
  high: 90
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const load = Math.max(0, input.currentLoad)
  const safeBoundary = input.safeBoundary ?? input.safeFloor
  const failureBoundary = input.failureBoundary ?? input.failureCeiling
  const turnBuffer = Math.max(0, input.turnBuffer ?? 0)

  if (input.parserHealth === 'unreliable') {
    return {
      level: 'unreliable',
      predictedNextTurnLoad: load,
      score: 100,
      trendScore: 0,
      reasons: ['page_adapter_unreliable']
    }
  }

  const reasons: string[] = []
  if (input.coverage !== 'complete') reasons.push('coverage_not_complete')
  if (input.parserHealth === 'degraded') reasons.push('parser_degraded')

  let level: Exclude<RiskLevel, 'unreliable'> = 'normal'

  if (input.usingWarmStartPrior) {
    if (
      failureBoundary !== undefined &&
      turnBuffer > 0 &&
      load + 3 * turnBuffer >= failureBoundary
    ) {
      level = 'long'
      reasons.push('warm_prior_near_boundary')
    } else if (safeBoundary !== undefined && load > safeBoundary) {
      level = 'long'
      reasons.push('warm_prior_above_safe_boundary')
    } else {
      reasons.push('warm_prior_learning')
    }
  } else if (failureBoundary !== undefined) {
    reasons.push('confirmed_failure_boundary')
    if (load >= failureBoundary) {
      level = 'high'
      reasons.push('at_or_above_failure_boundary')
    } else if (turnBuffer > 0) {
      if (load + turnBuffer >= failureBoundary) {
        level = 'high'
        reasons.push('within_one_typical_turn')
      } else if (load + 2 * turnBuffer >= failureBoundary) {
        level = 'organize'
        reasons.push('within_two_typical_turns')
      } else if (load + 3 * turnBuffer >= failureBoundary) {
        level = 'long'
        reasons.push('within_three_typical_turns')
      }
    } else if (safeBoundary !== undefined && load > safeBoundary) {
      level = 'long'
      reasons.push('above_safe_boundary_without_turn_buffer')
    }
  } else if (safeBoundary !== undefined) {
    reasons.push('confirmed_safe_boundary_only')
    if (load > safeBoundary) {
      level = 'long'
      reasons.push('above_confirmed_safe_boundary')
    }
  } else {
    reasons.push('learning_boundaries')
  }

  return {
    level,
    predictedNextTurnLoad: load + turnBuffer,
    score: SEVERITY_SCORE[level],
    trendScore: boundaryTrendScore(load, safeBoundary, failureBoundary),
    reasons
  }
}

function boundaryTrendScore(
  load: number,
  safeBoundary: number | undefined,
  failureBoundary: number | undefined
): number {
  if (load <= 0) return 0
  if (failureBoundary !== undefined && failureBoundary > 0) {
    return clamp((load / failureBoundary) * 100, 2, 100)
  }
  if (safeBoundary !== undefined && safeBoundary > 0) {
    if (load <= safeBoundary) return clamp((load / safeBoundary) * 45, 2, 45)
    return clamp(45 + ((load - safeBoundary) / safeBoundary) * 15, 45, 60)
  }
  return 2
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
