import type { ConversationControl, RiskAssessment, RiskLevel } from './types'

const LEVEL_RANK: Record<RiskLevel, number> = {
  normal: 0,
  long: 1,
  organize: 2,
  high: 3,
  unreliable: 4
}

// Product UX defaults only; not OpenAI thresholds.
const EXIT_SCORE = {
  long: 42,
  organize: 61,
  high: 76
} as const

export function stabilizeRiskLevel(
  raw: RiskAssessment,
  previous?: RiskLevel
): RiskLevel {
  if (raw.level === 'unreliable') return 'unreliable'
  if (!previous || previous === 'unreliable') return raw.level

  if (previous === 'high' && raw.level !== 'high' && raw.score >= EXIT_SCORE.high) {
    return 'high'
  }
  if (
    previous === 'organize' &&
    LEVEL_RANK[raw.level] < LEVEL_RANK.organize &&
    raw.score >= EXIT_SCORE.organize
  ) {
    return 'organize'
  }
  if (
    previous === 'long' &&
    raw.level === 'normal' &&
    raw.score >= EXIT_SCORE.long
  ) {
    return 'long'
  }
  return raw.level
}

export function shouldDrawAttention(input: {
  level: RiskLevel
  score: number
  userTurn: number
  control?: ConversationControl
}): boolean {
  const { level, score, userTurn, control } = input
  if (control?.muted) return false
  if (
    control?.snoozeUntilUserTurn !== undefined &&
    userTurn < control.snoozeUntilUserTurn
  ) {
    return false
  }
  if (level !== 'organize' && level !== 'high') return false

  const lastLevel = control?.lastAlertLevel
  if (!lastLevel || LEVEL_RANK[level] > LEVEL_RANK[lastLevel]) return true

  const lastTurn = control?.lastAlertUserTurn ?? -Infinity
  const lastScore = control?.lastAlertScore ?? -Infinity
  return userTurn - lastTurn >= 5 && score >= lastScore + 8
}

export function withAlertRecorded(
  control: ConversationControl | undefined,
  level: RiskLevel,
  score: number,
  userTurn: number
): ConversationControl {
  return {
    ...(control ?? {}),
    lastDisplayedLevel: level,
    lastAlertLevel: level,
    lastAlertScore: score,
    lastAlertUserTurn: userTurn
  }
}

export function withDisplayedLevel(
  control: ConversationControl | undefined,
  level: RiskLevel
): ConversationControl {
  return {
    ...(control ?? {}),
    lastDisplayedLevel: level
  }
}
