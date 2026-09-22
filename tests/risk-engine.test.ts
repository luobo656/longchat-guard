import { describe, expect, it } from 'vitest'
import { assessRisk } from '../src/core/risk-engine'

describe('risk engine', () => {
  it('fails closed when parser health is unreliable', () => {
    const result = assessRisk({
      currentLoad: 1000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'unreliable',
      confidence: 1
    })
    expect(result.level).toBe('unreliable')
  })

  it('becomes more conservative when coverage is incomplete', () => {
    const complete = assessRisk({
      currentLoad: 70000,
      composerLoad: 1000,
      expectedAssistantGrowth: 5000,
      safetyMargin: 3000,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.8,
      safeFloor: 90000,
      failureCeiling: 100000
    })
    const incomplete = assessRisk({
      currentLoad: 70000,
      composerLoad: 1000,
      expectedAssistantGrowth: 5000,
      safetyMargin: 3000,
      coverage: 'incomplete',
      parserHealth: 'healthy',
      confidence: 0.8,
      safeFloor: 90000,
      failureCeiling: 100000
    })
    expect(incomplete.score).toBeGreaterThan(complete.score)
  })

  it('does not escalate reliable load below safe floor to organize or high', () => {
    const result = assessRisk({
      currentLoad: 80000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.9,
      safeFloor: 90000
    })
    expect(['normal', 'long']).toContain(result.level)
    expect(result.level).not.toBe('organize')
    expect(result.level).not.toBe('high')
  })

  it('does not use failure ceiling as a zero-based linear risk ramp', () => {
    const result = assessRisk({
      currentLoad: 50000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.9,
      failureCeiling: 100000,
      estimatedRiskStart: 85000,
      estimatedHighRisk: 95000
    })
    expect(result.level).toBe('normal')
    expect(result.reasons).toContain('below_calibrated_risk_start')
  })

  it('is high when predicted load reaches confirmed failure ceiling', () => {
    const result = assessRisk({
      currentLoad: 100000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.9,
      failureCeiling: 100000,
      estimatedRiskStart: 85000,
      estimatedHighRisk: 95000
    })
    expect(result.level).toBe('high')
  })

  it('caps complete cold-start at long even for very large estimated load', () => {
    const result = assessRisk({
      currentLoad: 300000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.05
    })
    expect(['normal', 'long']).toContain(result.level)
  })

  it('keeps incomplete cold-start more conservative but still capped at long', () => {
    const complete = assessRisk({
      currentLoad: 300000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.8
    })
    const incomplete = assessRisk({
      currentLoad: 300000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'incomplete',
      parserHealth: 'healthy',
      confidence: 0.8
    })
    expect(incomplete.score).toBeGreaterThan(complete.score)
    expect(['normal', 'long']).toContain(incomplete.level)
  })

  it('caps a single low safe-floor sample at long even when predicted load doubles it', () => {
    const result = assessRisk({
      currentLoad: 3200,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.2,
      safeFloor: 1600,
      safeFloorEvidenceReady: false,
      estimatedRiskStart: 1600,
      estimatedHighRisk: 4600
    })
    expect(['normal', 'long']).toContain(result.level)
    expect(result.level).not.toBe('organize')
    expect(result.reasons).toContain('safe_floor_evidence_learning')
  })

  it('can organize after multiple confirmed safe conversations establish stronger evidence', () => {
    const result = assessRisk({
      currentLoad: 4600,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.6,
      safeFloor: 1600,
      safeFloorEvidenceReady: true,
      estimatedRiskStart: 1600,
      estimatedHighRisk: 4600
    })
    expect(result.level).toBe('organize')
    expect(result.level).not.toBe('high')
  })

  it('allows safe-floor-only risk to rise gradually after safe floor without going high', () => {
    const result = assessRisk({
      currentLoad: 96000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.9,
      safeFloor: 90000,
      estimatedRiskStart: 90000,
      safeFloorEvidenceReady: true,
      estimatedHighRisk: 110000
    })
    expect(['long', 'organize']).toContain(result.level)
    expect(result.level).not.toBe('high')
  })

  it('can ignore unsent composer and expected response growth when callers pass current load only', () => {
    const result = assessRisk({
      currentLoad: 80000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.9,
      failureCeiling: 100000
    })
    expect(result.predictedNextTurnLoad).toBe(80000)
  })

  it('keeps predicted load equal to current load when future inputs are zeroed', () => {
    const result = assessRisk({
      currentLoad: 1000,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.5,
      estimatedRiskStart: 5000,
      estimatedHighRisk: 8000
    })
    expect(result.predictedNextTurnLoad).toBe(1000)
  })

  it('is conservative for contradictory safe and failure bounds', () => {
    const result = assessRisk({
      currentLoad: 3500,
      composerLoad: 0,
      expectedAssistantGrowth: 0,
      safetyMargin: 0,
      coverage: 'complete',
      parserHealth: 'healthy',
      confidence: 0.2,
      safeFloor: 5000,
      failureCeiling: 3000,
      estimatedRiskStart: 2800,
      estimatedHighRisk: 3000
    })
    expect(result.reasons).toContain('contradictory_calibration_bounds')
    expect(result.score).toBeGreaterThan(80)
  })
})
