import { describe, expect, it } from 'vitest'
import {
  PANEL_FORBIDDEN_VALUE_PATTERNS,
  PANEL_VISIBLE_LABELS,
  PRIVACY_CONSENT_COPY
} from '../src/content/ui'

describe('guard UI labels', () => {
  it('keeps the 2.0 panel focused on risk, learning, and actions', () => {
    expect(PANEL_VISIBLE_LABELS).toEqual([
      'Risk',
      'Safe',
      'High risk',
      'Learning',
      'Copy continuation prompt',
      'Scan current chat',
      'Relearn',
      'Mute this chat'
    ])

    const removedLabels = [
      'Next-turn prediction',
      'Coverage statistics',
      'Calibration confidence',
      'Confirmed safe through',
      'Historical risk zone',
      'Remind in 5 turns',
      'Restore previous profile',
      'Clear all learning data'
    ]
    for (const label of removedLabels) {
      expect(PANEL_VISIBLE_LABELS).not.toContain(label)
    }
  })

  it('forbids user-visible precise estimate patterns', () => {
    const visibleCopy = PANEL_VISIBLE_LABELS.join('\n')
    const forbiddenSamples = ['token', 'tokens', '≈32', '32K', '32 K', '75%']

    for (const pattern of PANEL_FORBIDDEN_VALUE_PATTERNS) {
      expect(new RegExp(pattern, 'i').test(visibleCopy)).toBe(false)
    }
    for (const sample of forbiddenSamples) {
      expect(
        PANEL_FORBIDDEN_VALUE_PATTERNS.some((pattern) =>
          new RegExp(pattern, 'i').test(sample)
        )
      ).toBe(true)
    }
  })

  it('keeps the monitoring panel copy short and direct', () => {
    const visibleCopy = PANEL_VISIBLE_LABELS.join('\n')
    expect(visibleCopy).toContain('Risk')
    expect(visibleCopy).toContain('Safe')
    expect(visibleCopy).toContain('High risk')
    expect(visibleCopy).not.toContain('official quota progress')
    expect(visibleCopy).not.toContain('learning evidence')
    expect(visibleCopy).not.toContain('rule')
  })

  it('contains the required privacy consent copy', () => {
    expect(PRIVACY_CONSENT_COPY).toEqual([
      'Reads visible ChatGPT content locally to estimate long-chat risk.',
      'Does not upload chat content.',
      'Does not save raw chat text.',
      'Uninstall or clear extension data to remove local data.',
      'Agree and start',
      'Not now'
    ])
  })

  it('avoids explanation-heavy monitoring copy', () => {
    const visibleCopy = PANEL_VISIBLE_LABELS.join('\n')
    expect(visibleCopy).not.toContain('Please wait while the extension learns')
    expect(visibleCopy).not.toContain('will automatically remind you later')
    expect(visibleCopy).not.toContain('give the extension some time')
  })
})
