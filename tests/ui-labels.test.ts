import { describe, expect, it } from 'vitest'
import en from '../public/_locales/en/messages.json'
import {
  activeRiskSegmentCount,
  shouldRenderRiskTrack,
  type GuardUiModel
} from '../src/content/ui'

const FORBIDDEN_VALUE_PATTERNS = [
  String.raw`\btoken\b`,
  String.raw`\btokens\b`,
  String.raw`≈\s*\d`,
  String.raw`\d+\s*K\b`,
  String.raw`\d+\s*%`
] as const

const allEnglishCopy = Object.values(en)
  .map((entry) => entry.message)
  .join('\n')

function model(
  overrides: Partial<GuardUiModel> = {}
): GuardUiModel {
  return {
    measurementState: 'complete',
    calibrationState: 'calibrated',
    environmentConfidence: 'verified',
    riskState: 'normal',
    referencePositionScore: 20,
    trackAvailable: true,
    growthReserveReady: true,
    muted: false,
    pendingFailureConfirmation: false,
    uncertaintySources: [],
    ...overrides
  }
}

describe('guard UI product contract', () => {
  it('exposes the one-step calibration language and no old two-scan language', () => {
    expect(en.actionCalibrateThisChat.message).toBe(
      'Calibrate with this chat'
    )
    expect(en.actionCalibrateThisChatHelp.message).toContain(
      'conversation-length limit'
    )
    expect(en.actionRecalibrate.message).toBe(
      'Recalibrate alert reference'
    )
    expect(en.actionMeasureCurrentChat.message).toBe(
      'Read full current chat'
    )
    expect("actionMeasureCurrentChatHelp" in en).toBe(false)
    expect(allEnglishCopy).not.toContain('Scan current chat')
    expect(allEnglishCopy).not.toContain('Establish current progress')
    expect(allEnglishCopy).not.toContain('Scan a chat that reached the limit')
    expect(allEnglishCopy).not.toContain('Improve alert accuracy')
    expect(allEnglishCopy).not.toContain('Relearn chat-length baseline')
  })

  it('hard-blocks the risk track when the reference or measurement is unusable', () => {
    expect(en.statusEnvironmentUnknown.message).toBe('Unable to assess')
    expect(en.statusEnvironmentUnknownHelp.message).toContain('temporarily unavailable')
    expect(en.statusStaleHelp.message).toContain('measurement method has changed')
    expect(shouldRenderRiskTrack(model())).toBe(true)
    expect(
      shouldRenderRiskTrack(
        model({ calibrationState: 'uncalibrated', riskState: 'unknown' })
      )
    ).toBe(false)
    expect(
      shouldRenderRiskTrack(
        model({ calibrationState: 'stale', riskState: 'unknown' })
      )
    ).toBe(false)
    expect(
      shouldRenderRiskTrack(
        model({ calibrationState: 'environment_unknown', riskState: 'unknown' })
      )
    ).toBe(false)
    expect(
      shouldRenderRiskTrack(
        model({ measurementState: 'uncertain', riskState: 'unknown' })
      )
    ).toBe(false)
    expect(
      shouldRenderRiskTrack(
        model({ riskState: 'unknown' })
      )
    ).toBe(false)
    expect(
      shouldRenderRiskTrack(
        model({ trackAvailable: false })
      )
    ).toBe(false)
  })

  it('centers calibrated UI copy on risk rather than optional model metadata', () => {
    expect(en.riskNormal.message).toBe('Lower risk')
    expect(en.riskAdviceNormal.message).toContain('lower-risk range')
    expect(
      shouldRenderRiskTrack(
        model({
          environmentConfidence: 'unverified',
          riskState: 'normal',
          trackAvailable: true,
          referencePositionScore: 20
        })
      )
    ).toBe(true)
    expect('statusEnvironmentUnverified' in en).toBe(false)
    expect('statusEnvironmentUnverifiedHelp' in en).toBe(false)
  })

  it('allows a conservative calibrated reference to render calibrated risk', () => {
    expect(
      shouldRenderRiskTrack(
        model({ calibrationState: 'calibrated_conservative' })
      )
    ).toBe(true)
  })

  it('forbids user-visible fake precision patterns', () => {
    const forbiddenSamples = [
      'token',
      'tokens',
      '≈32',
      '32K',
      '32 K',
      '75%'
    ]

    for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
      expect(new RegExp(pattern, 'i').test(allEnglishCopy)).toBe(false)
    }
    for (const sample of forbiddenSamples) {
      expect(
        FORBIDDEN_VALUE_PATTERNS.some((pattern) =>
          new RegExp(pattern, 'i').test(sample)
        )
      ).toBe(true)
    }
  })

  it('contains the required privacy consent copy', () => {
    expect([
      en.consentLocalRead.message,
      en.consentNoUpload.message,
      en.consentNoRawPersist.message,
      en.consentDeleteLocal.message,
      en.consentAccept.message,
      en.consentDecline.message
    ]).toEqual([
      'Reads visible ChatGPT content locally to estimate long-chat risk.',
      'Does not upload chat content.',
      'Does not save raw chat text.',
      'Uninstall or clear extension data to remove local data.',
      'Agree and start',
      'Not now'
    ])
  })

  it('quantizes calibrated risk into sixteen segments', () => {
    expect(activeRiskSegmentCount(0)).toBe(0)
    expect(activeRiskSegmentCount(0.1)).toBe(1)
    expect(activeRiskSegmentCount(6.25)).toBe(1)
    expect(activeRiskSegmentCount(6.26)).toBe(1)
    expect(activeRiskSegmentCount(12.49)).toBe(1)
    expect(activeRiskSegmentCount(12.5)).toBe(2)
    expect(activeRiskSegmentCount(18.74)).toBe(2)
    expect(activeRiskSegmentCount(18.75)).toBe(3)
    expect(activeRiskSegmentCount(62.5)).toBe(10)
    expect(activeRiskSegmentCount(75)).toBe(12)
    expect(activeRiskSegmentCount(87.5)).toBe(14)
    expect(activeRiskSegmentCount(100)).toBe(16)
  })
})
