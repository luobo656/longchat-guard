import { describe, expect, it } from 'vitest'
import {
  buildStoredScanDiagnostics,
  shouldDiscardStoredScanDiagnostics
} from '../src/content/app'
import type { HistoryScanResult } from '../src/content/history-scanner'

function failedResult(stageCount = 10): HistoryScanResult {
  return {
    complete: false,
    reason: 'window_alignment_failed',
    observedMessages: [],
    messageCount: 0,
    attachmentCount: 0,
    unknownRoleCount: 0,
    diagnostics: Array.from({ length: stageCount }, (_, index) => ({
      at: index,
      phase: index === stageCount - 1 ? 'failure' as const : 'capture' as const,
      step: index,
      scrollTop: index * 10,
      scrollHeight: 1000,
      clientHeight: 500,
      logicalTop: index * 10,
      scrollMode: 'normal' as const,
      pageMessageCount: 4,
      observedCount: index,
      totalMessageCount: index + 1,
      ...(index === stageCount - 1
        ? { reason: 'window_alignment_failed' as const }
        : {}),
      surfaceHint: 'should-not-persist'
    }))
  }
}

describe('scan diagnostic retention', () => {
  it('stores only a bounded structural tail without chat content or surface hints', () => {
    const saved = buildStoredScanDiagnostics(failedResult(), 1000)

    expect(saved?.version).toBe(3)
    expect(saved?.reason).toBe('window_alignment_failed')
    expect(saved?.stages).toHaveLength(8)
    expect(saved?.stages[0]?.scrollTop).toBe(20)
    expect(JSON.stringify(saved)).not.toContain('surfaceHint')
    expect(JSON.stringify(saved)).not.toContain('should-not-persist')
  })

  it('does not create diagnostics for successful scans', () => {
    const failed = failedResult(2)
    const { reason: _reason, ...withoutReason } = failed
    expect(
      buildStoredScanDiagnostics(
        {
          ...withoutReason,
          complete: true
        },
        1000
      )
    ).toBeUndefined()
  })

  it('keeps the latest diagnostic for up to seven days and expires older data', () => {
    const saved = buildStoredScanDiagnostics(failedResult(2), 1_000)!
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    expect(shouldDiscardStoredScanDiagnostics(saved, 1_000 + sevenDays)).toBe(false)
    expect(shouldDiscardStoredScanDiagnostics(saved, 1_001 + sevenDays)).toBe(true)
    expect(shouldDiscardStoredScanDiagnostics({ version: 2, recordedAt: 1_000 }, 2_000)).toBe(true)
  })
})
