import { describe, expect, it } from 'vitest'
import {
  shouldDrawAttention,
  stabilizeRiskLevel,
  withAlertRecorded
} from '../src/core/warning-controller'
import type { RiskAssessment } from '../src/core/types'

function risk(level: RiskAssessment['level'], score: number): RiskAssessment {
  return {
    level,
    score,
    predictedNextTurnLoad: 100,
    reasons: []
  }
}

describe('warning controller', () => {
  it('uses hysteresis so high risk does not flicker down at the boundary', () => {
    expect(stabilizeRiskLevel(risk('organize', 78), 'high')).toBe('high')
    expect(stabilizeRiskLevel(risk('organize', 75), 'high')).toBe('organize')
    expect(stabilizeRiskLevel(risk('normal', 44), 'long')).toBe('long')
    expect(stabilizeRiskLevel(risk('normal', 40), 'long')).toBe('normal')
  })

  it('draws attention on first strong warning and on escalation', () => {
    const first = shouldDrawAttention({
      level: 'organize',
      score: 70,
      userTurn: 10,
      control: {}
    })
    expect(first).toBe(true)

    const recorded = withAlertRecorded({}, 'organize', 70, 10)
    expect(
      shouldDrawAttention({
        level: 'organize',
        score: 72,
        userTurn: 11,
        control: recorded
      })
    ).toBe(false)
    expect(
      shouldDrawAttention({
        level: 'high',
        score: 84,
        userTurn: 11,
        control: recorded
      })
    ).toBe(true)
  })

  it('honors mute, snooze, and same-level cooldown', () => {
    expect(
      shouldDrawAttention({
        level: 'high',
        score: 90,
        userTurn: 20,
        control: { muted: true }
      })
    ).toBe(false)
    expect(
      shouldDrawAttention({
        level: 'high',
        score: 90,
        userTurn: 20,
        control: { snoozeUntilUserTurn: 23 }
      })
    ).toBe(false)

    const recorded = withAlertRecorded({}, 'high', 82, 10)
    expect(
      shouldDrawAttention({
        level: 'high',
        score: 89,
        userTurn: 15,
        control: recorded
      })
    ).toBe(false)
    expect(
      shouldDrawAttention({
        level: 'high',
        score: 90,
        userTurn: 15,
        control: recorded
      })
    ).toBe(true)
  })
})
