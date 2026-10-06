import { describe, expect, it } from 'vitest'
import { assessRisk } from '../src/core/risk-engine'
import type { RiskInput } from '../src/core/types'

const calibrated = (
  overrides: Partial<{
    [K in keyof RiskInput]: RiskInput[K] | undefined
  }> = {}
): RiskInput => ({
  currentLoad: 10_000,
  composerDraftLoad: 0,
  measurementState: 'complete',
  calibrationState: 'calibrated',
  environmentConfidence: 'verified',
  failureReference: {
    load: 100_000,
    quality: 'strong',
    sourceConversationCount: 1
  },
  growthReserve: 5_000,
  ...overrides
} as RiskInput)

describe('risk engine product invariants', () => {
  it('never calls an uncalibrated conversation normal', () => {
    const result = assessRisk(
      calibrated({
        calibrationState: 'uncalibrated',
        failureReference: undefined
      })
    )
    expect(result.state).toBe('unknown')
    expect(result.referencePositionScore).toBe(0)
  })

  it('fails closed when measurement is partial, unavailable or uncertain', () => {
    for (const measurementState of [
      'partial',
      'unavailable',
      'uncertain'
    ] as const) {
      expect(
        assessRisk(calibrated({ measurementState })).state
      ).toBe('unknown')
    }
  })

  it('treats stale and calibrating references as unknown', () => {
    expect(
      assessRisk(calibrated({ calibrationState: 'stale' })).state
    ).toBe('unknown')
    expect(
      assessRisk(calibrated({ calibrationState: 'calibrating' })).state
    ).toBe('unknown')
  })

  it('allows verified environment + usable reference + low load to be normal', () => {
    const result = assessRisk(
      calibrated({
        currentLoad: 20_000,
        environmentConfidence: 'verified',
        failureReference: {
          load: 100_000,
          quality: 'conservative',
          sourceConversationCount: 1
        },
        growthReserve: 5_000
      })
    )
    expect(result.state).toBe('normal')
    expect(result.referencePositionScore).toBeGreaterThan(0)
  })

  it('does not let missing diagnostic environment metadata suppress a low-risk result', () => {
    const result = assessRisk(
      calibrated({
        currentLoad: 20_000,
        environmentConfidence: 'unverified',
        calibrationState: 'calibrated',
        failureReference: {
          load: 100_000,
          quality: 'strong',
          sourceConversationCount: 1
        },
        growthReserve: 5_000
      })
    )
    expect(result.state).toBe('normal')
    expect(result.referencePositionScore).toBeGreaterThan(0)
  })

  it('keeps warning thresholds independent of optional environment metadata', () => {
    const near = assessRisk(
      calibrated({
        currentLoad: 90_000,
        environmentConfidence: 'unverified',
        calibrationState: 'calibrated',
        failureReference: {
          load: 100_000,
          quality: 'strong',
          sourceConversationCount: 1
        },
        growthReserve: 5_000
      })
    )
    const atReference = assessRisk(
      calibrated({
        currentLoad: 100_000,
        environmentConfidence: 'unverified',
        calibrationState: 'calibrated',
        failureReference: {
          load: 100_000,
          quality: 'strong',
          sourceConversationCount: 1
        },
        growthReserve: undefined
      })
    )

    expect(near.state).toBe('organize')
    expect(near.referencePositionScore).toBe(90)
    expect(atReference.state).toBe('high')
    expect(atReference.referencePositionScore).toBe(100)
  })

  it('never uses a confirmed environment mismatch to certify normal', () => {
    const result = assessRisk(
      calibrated({
        currentLoad: 20_000,
        environmentConfidence: 'mismatch',
        calibrationState: 'stale',
        failureReference: {
          load: 100_000,
          quality: 'strong',
          sourceConversationCount: 1
        }
      })
    )
    expect(result.state).toBe('unknown')
    expect(result.referencePositionScore).toBe(0)
  })

  it('uses whole-turn reserve bands only after a usable reference exists', () => {
    expect(
      assessRisk(calibrated({ currentLoad: 84_999 })).state
    ).toBe('normal')
    expect(
      assessRisk(calibrated({ currentLoad: 85_000 })).state
    ).toBe('long')
    expect(
      assessRisk(calibrated({ currentLoad: 90_000 })).state
    ).toBe('organize')
    expect(
      assessRisk(calibrated({ currentLoad: 95_000 })).state
    ).toBe('high')
  })

  it('does not invent reserve bands before turn growth is learned', () => {
    expect(
      assessRisk(
        calibrated({
          currentLoad: 99_999,
          growthReserve: undefined
        })
      ).state
    ).toBe('normal')
    expect(
      assessRisk(
        calibrated({
          currentLoad: 100_000,
          growthReserve: undefined
        })
      ).state
    ).toBe('high')
  })

  it('includes unsent composer text before send', () => {
    const withoutDraft = assessRisk(
      calibrated({
        currentLoad: 90_000,
        composerDraftLoad: 0,
        growthReserve: 5_000
      })
    )
    const withDraft = assessRisk(
      calibrated({
        currentLoad: 90_000,
        composerDraftLoad: 5_001,
        growthReserve: 5_000
      })
    )

    expect(withoutDraft.state).toBe('organize')
    expect(withDraft.state).toBe('high')
    expect(withDraft.projectedLoad).toBe(100_001)
    expect(withoutDraft.referencePositionScore).toBe(90)
    expect(withDraft.referencePositionScore).toBeCloseTo(95.001)
    expect(withDraft.reasons).toContain('composer_draft_included')
  })

  it('keeps the visual track linear to the empirical failure reference even when growth reserve is large', () => {
    const smallChat = assessRisk(
      calibrated({
        currentLoad: 4_000,
        failureReference: {
          load: 50_000,
          quality: 'strong',
          sourceConversationCount: 1
        },
        growthReserve: 10_000
      })
    )

    expect(smallChat.state).toBe('normal')
    expect(smallChat.referencePositionScore).toBe(8)
  })

  it('allows conservative empirical references without pretending they are strong', () => {
    const result = assessRisk(
      calibrated({
        currentLoad: 100_000,
        calibrationState: 'calibrated_conservative',
        failureReference: {
          load: 100_000,
          quality: 'conservative',
          sourceConversationCount: 1
        },
        growthReserve: undefined
      })
    )
    expect(result.state).toBe('high')
    expect(result.reasons).toContain(
      'conservative_failure_reference'
    )
  })

  it('maps usable local references onto a 0-100 visual reference position', () => {
    const atReference = assessRisk(
      calibrated({ currentLoad: 100_000, growthReserve: undefined })
    )
    expect(atReference.referencePositionScore).toBe(100)

    const unknown = assessRisk(
      calibrated({
        currentLoad: 100_000,
        calibrationState: 'uncalibrated',
        failureReference: undefined
      })
    )
    expect(unknown.referencePositionScore).toBe(0)
  })
})
