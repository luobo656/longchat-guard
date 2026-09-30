import { describe, expect, it } from 'vitest'
import { assessRisk } from '../src/core/risk-engine'

describe('risk engine 2.0', () => {
  it('fails closed when parser health is unreliable', () => {
    const result = assessRisk({
      currentLoad: 1000,
      coverage: 'complete',
      parserHealth: 'unreliable'
    })
    expect(result.level).toBe('unreliable')
    expect(result.score).toBe(100)
  })

  it('does not let incomplete coverage or low legacy confidence inflate a short conversation', () => {
    const complete = assessRisk({
      currentLoad: 305,
      coverage: 'complete',
      parserHealth: 'healthy',
      failureBoundary: 77324,
      turnBuffer: 2000,
      confidence: 1
    })
    const incomplete = assessRisk({
      currentLoad: 305,
      coverage: 'incomplete',
      parserHealth: 'healthy',
      failureBoundary: 77324,
      turnBuffer: 2000,
      confidence: 0.01
    })
    expect(complete.level).toBe('normal')
    expect(incomplete.level).toBe('normal')
    expect(incomplete.score).toBe(complete.score)
    expect(incomplete.trendScore).toBeLessThan(5)
  })

  it('keeps an uncalibrated conversation normal and visually near the left edge', () => {
    const result = assessRisk({
      currentLoad: 300000,
      coverage: 'complete',
      parserHealth: 'healthy'
    })
    expect(result.level).toBe('normal')
    expect(result.trendScore).toBeLessThanOrEqual(2)
  })

  it('uses a safe-only boundary as weak evidence and never escalates above long', () => {
    const within = assessRisk({
      currentLoad: 50000,
      coverage: 'complete',
      parserHealth: 'healthy',
      safeBoundary: 50000
    })
    const above = assessRisk({
      currentLoad: 100000,
      coverage: 'complete',
      parserHealth: 'healthy',
      safeBoundary: 50000
    })
    expect(within.level).toBe('normal')
    expect(above.level).toBe('long')
    expect(above.level).not.toBe('organize')
    expect(above.level).not.toBe('high')
    expect(above.trendScore).toBeLessThanOrEqual(60)
  })

  it('does not invent warning bands from F until B is learned', () => {
    const below = assessRisk({
      currentLoad: 76000,
      coverage: 'complete',
      parserHealth: 'healthy',
      failureBoundary: 77324
    })
    const at = assessRisk({
      currentLoad: 77324,
      coverage: 'complete',
      parserHealth: 'healthy',
      failureBoundary: 77324
    })
    expect(below.level).toBe('normal')
    expect(at.level).toBe('high')
  })

  it('uses one, two, and three learned turn buffers as the warning bands', () => {
    const base = {
      coverage: 'complete' as const,
      parserHealth: 'healthy' as const,
      failureBoundary: 77324,
      turnBuffer: 2000
    }
    expect(assessRisk({ ...base, currentLoad: 71323 }).level).toBe('normal')
    expect(assessRisk({ ...base, currentLoad: 71324 }).level).toBe('long')
    expect(assessRisk({ ...base, currentLoad: 73324 }).level).toBe('organize')
    expect(assessRisk({ ...base, currentLoad: 75324 }).level).toBe('high')
    expect(assessRisk({ ...base, currentLoad: 77324 }).level).toBe('high')
  })

  it('maps the visible trend directly to the empirical failure boundary', () => {
    const result = assessRisk({
      currentLoad: 305,
      coverage: 'incomplete',
      parserHealth: 'healthy',
      failureBoundary: 77324,
      turnBuffer: 2000
    })
    expect(result.level).toBe('normal')
    expect(result.trendScore).toBeLessThan(5)
  })

  it('ignores legacy composer and heuristic inputs', () => {
    const result = assessRisk({
      currentLoad: 1000,
      composerLoad: 50000,
      expectedAssistantGrowth: 50000,
      safetyMargin: 50000,
      confidence: 0,
      feedbackBias: 6,
      coverage: 'complete',
      parserHealth: 'healthy'
    })
    expect(result.level).toBe('normal')
    expect(result.predictedNextTurnLoad).toBe(1000)
  })

  it('uses B for predicted next-turn load', () => {
    const result = assessRisk({
      currentLoad: 70000,
      coverage: 'complete',
      parserHealth: 'healthy',
      failureBoundary: 80000,
      turnBuffer: 2500
    })
    expect(result.predictedNextTurnLoad).toBe(72500)
  })

  it('treats warm-start boundaries as guidance, not strong warnings', () => {
    const result = assessRisk({
      currentLoad: 79000,
      coverage: 'complete',
      parserHealth: 'healthy',
      failureBoundary: 80000,
      turnBuffer: 2000,
      usingWarmStartPrior: true
    })
    expect(['normal', 'long']).toContain(result.level)
    expect(result.level).not.toBe('organize')
    expect(result.level).not.toBe('high')
  })
})
