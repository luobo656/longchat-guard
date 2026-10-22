import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryScanResult } from '../src/content/history-scanner'
import {
  ScanComparisonLog, safeScanError
} from '../src/content/scan-test-log'

beforeEach(() => {
  // A deterministic stand-in for subtle.digest in tests (production uses SHA-256).
  vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, raw: ArrayBuffer) => {
    const result = new Uint8Array(32)
    const bytes = new Uint8Array(raw)
    for (let i = 0; i < bytes.length; i++) {
      const index = i % 32
      result[index] = (((result[index] ?? 0) * 31) + (bytes[i] ?? 0)) % 256
    }
    return result.buffer
  } } })
})
afterEach(() => { vi.unstubAllGlobals() })

function sample(override: Partial<HistoryScanResult> = {}): HistoryScanResult {
  return {
    complete: true,
    messageCount: 3,
    observedMessages: [
      { role: 'user', contentFingerprint: 'salted-first-secret-fingerprint',
        tokenEstimate: 12, charCount: 40, observedAt: 1 },
      { role: 'assistant', contentFingerprint: 'salted-middle-secret-fingerprint',
        tokenEstimate: 23, charCount: 80, observedAt: 1, hasCode: true },
      { role: 'user', contentFingerprint: 'salted-last-secret-fingerprint',
        tokenEstimate: 9, charCount: 36, observedAt: 1 }
    ],
    unknownRoleCount: 0,
    attachmentCount: 0,
    uncertaintySources: [],
    diagnostics: [
      { at: 1000, phase: 'start', scrollTop: 800,
        scrollHeight: 1900, clientHeight: 800,
        surfaceHint: 'private-user-name@example.com' },
      { at: 1300, phase: 'scroll_up', scrollTop: 0,
        scrollHeight: 1900, clientHeight: 800, step: 1,
        totalMessageCount: 3 },
      { at: 1600, phase: 'complete', scrollTop: 1100,
        scrollHeight: 1900, clientHeight: 800,
        totalMessageCount: 3 }
    ],
    ...override
  }
}

function parse(log: ScanComparisonLog) {
  const output = log.exportText()
  expect(output.startsWith('LCG-READ-COMPARE-v1\n')).toBe(true)
  return JSON.parse(output.slice(output.indexOf('\n') + 1))
}

describe('privacy-safe read test report', () => {
  it('compares ordered scan digests and estimated units for the same chat', async () => {
    const log = new ScanComparisonLog('4.2.23')
    const manual = log.start('current_chat', 'private-salted-conversation-key-123')
    manual.choose('manual')
    manual.manualTop()
    manual.manualBottom()
    await manual.scannerResult(sample())
    manual.saved(44)
    log.complete(manual)

    const automatic = log.start('current_chat', 'private-salted-conversation-key-123')
    automatic.choose('auto')
    automatic.stage('up')
    automatic.step({phase:'up',step:0,scrollTop:900,scrollHeight:1900,
      clientHeight:800,moved:true,heightChanged:false,atBoundary:false})
    automatic.stage('settle')
    automatic.stage('down')
    automatic.step({phase:'down',step:30,scrollTop:1100,scrollHeight:1900,
      clientHeight:800,moved:false,heightChanged:false,atBoundary:true})
    automatic.stage('done')
    await automatic.scannerResult(sample())
    automatic.saved(44)
    log.complete(automatic)

    const data = parse(log)
    expect(log.hasReports()).toBe(true)
    expect(data.count).toBe(2)
    expect(data.version).toBe('4.2.23')
    expect(data.runs[0].saved).toBe(true)
    expect(data.runs[0].manualConfirmedTop).toBe(true)
    expect(data.runs[1].selectedMode).toBe('auto')
    expect(data.runs[1].autoWheel.up.wheelCommands).toBe(1)
    expect(data.runs[1].autoWheel.down.boundaryObservations).toBe(1)
    expect(data.runs[0].scanner.totalEstimatedUnitsNotOfficialTokens).toBe(44)
    expect(data.runs[0].scanner.roleCounts).toEqual({
      user: 2, assistant: 1, unknown: 0
    })
    expect(data.comparison).toMatchObject({
      available: true, manualRun: 1, automaticRun: 2,
      automaticFellBackToManual: false,
      bothCommitted: true, messageCountDeltaAutoMinusManual: 0,
      estimatedUnitsDeltaAutoMinusManual: 0,
      sameOrderedDigest: true, sameFirst12: true, sameLast12: true
    })
    expect(data.runs[0].conversationGroup).toBe('conversation_1')
    expect(data.runs[1].conversationGroup).toBe('conversation_1')
  })

  it('excludes private content, raw keys, raw fingerprints, arbitrary DOM and exception strings', async () => {
    const log = new ScanComparisonLog('4.2.23')
    const recorder = log.start('historical_calibration',
      'PRIVATE_CHAT_ID_UNSAFE_TO_SHARE')
    recorder.choose('auto')
    recorder.autoFailed(new Error('account_email=leak@example.com url=https://secret.invalid'))
    recorder.fallBackToManual()
    await recorder.scannerResult(sample({
      diagnostics: [{
        at: 8, phase: 'failure', reason: 'head_not_stable',
        scrollTop: 0, scrollHeight: 0, clientHeight: 0,
        surfaceHint: 'https://private.invalid/username',
      }],
      complete: false, reason: 'head_not_stable'
    }))
    log.complete(recorder)
    const copied = log.exportText()
    for (const forbidden of [
      'PRIVATE_CHAT_ID_UNSAFE_TO_SHARE', 'salted-first-secret-fingerprint',
      'salted-middle-secret-fingerprint', 'salted-last-secret-fingerprint',
      'leak@example.com', 'https://private.invalid',
      'https://secret.invalid', 'surfaceHint', 'contentFingerprint'
    ]) {
      expect(copied).not.toContain(forbidden)
    }
    const data = parse(log)
    expect(data.runs[0].autoFailureCode).toBe('unclassified_error')
    expect(data.runs[0].status).toBe('scanner_incomplete')
    expect(data.runs[0].saved).toBe(false)
    expect(data.runs[0].failureCode).toBe('head_not_stable')
    expect(data.runs[0].effectiveMode).toBe('manual')
    expect(data.runs[0].scanner.timeline.phaseCounts.failure).toBe(1)
  })

  it('records cancellations and failed automatic preparation without scanner success', () => {
    const log = new ScanComparisonLog('4.2.23')
    const auto = log.start('current_chat', 'key-1')
    auto.choose('auto')
    auto.stage('up')
    auto.autoFailed(new Error('auto_scroll_no_progress'))
    auto.cancelled('user_declined_fallback')
    log.complete(auto)
    const manual = log.start('current_chat', 'key-1')
    manual.choose('manual')
    manual.cancelled('user_cancelled')
    log.complete(manual)
    const report = parse(log)
    expect(report.runs[0].scanner).toBeNull()
    expect(report.runs[0].autoFailureCode).toBe('auto_scroll_no_progress')
    expect(report.runs[0].status).toBe('cancelled')
    expect(report.runs[1].status).toBe('cancelled')
    expect(report.comparison.bothCommitted).toBe(false)
    expect(report.comparison.sameOrderedDigest).toBeNull()
  })

  it('does not mislabel a parser rejection or commit exception as saved', async () => {
    const log = new ScanComparisonLog('4.2.23')
    const rejected = log.start('current_chat', 'key-1')
    rejected.choose('manual')
    await rejected.scannerResult(sample())
    rejected.parserRejected()
    log.complete(rejected)
    const failed = log.start('current_chat', 'key-1')
    failed.choose('auto')
    await failed.scannerResult(sample())
    failed.failed(new Error('token=SECRET_ACCESS_VALUE'))
    log.complete(failed)
    const report = parse(log)
    expect(report.runs[0].status).toBe('parser_rejected')
    expect(report.runs[0].saved).toBe(false)
    expect(report.runs[1].status).toBe('commit_failed')
    expect(report.runs[1].failureCode).toBe('unclassified_error')
    expect(log.exportText()).not.toContain('SECRET_ACCESS_VALUE')
  })

  it('does not pair results from different chats and keeps only last four runs', async () => {
    const log = new ScanComparisonLog('4.2.23')
    for (let i=0; i<5; i++) {
      const recorder=log.start('current_chat','private-identity-'+i)
      recorder.choose(i%2===0?'manual':'auto')
      await recorder.scannerResult(sample())
      recorder.saved(44)
      log.complete(recorder)
    }
    const data=parse(log)
    expect(data.count).toBe(4)
    expect(data.comparison.available).toBe(false)
    expect(log.exportText()).not.toContain('private-identity-')
    expect(data.runs.map((r:{conversationGroup:string})=>r.conversationGroup))
      .toEqual(['conversation_1','conversation_2','conversation_3','conversation_4'])
  })

  it('exposes a numerical difference and a changed checksum when the automatic pass omits a message', async () => {
    const log = new ScanComparisonLog('4.2.23')
    const manual = log.start('current_chat', 'same-private-chat')
    manual.choose('manual')
    await manual.scannerResult(sample())
    manual.saved(44)
    log.complete(manual)
    const auto = log.start('current_chat', 'same-private-chat')
    auto.choose('auto')
    const incompleteRecords = sample().observedMessages.slice(1)
    await auto.scannerResult(sample({
      complete: false, reason: 'window_alignment_failed',
      messageCount: incompleteRecords.length,
      observedMessages: incompleteRecords
    }))
    log.complete(auto)
    const data = parse(log)
    expect(data.comparison.messageCountDeltaAutoMinusManual).toBe(-1)
    expect(data.comparison.estimatedUnitsDeltaAutoMinusManual).toBe(-12)
    expect(data.comparison.sameOrderedDigest).toBe(false)
    expect(data.comparison.automaticScanComplete).toBe(false)
    expect(data.comparison.bothCommitted).toBe(false)
  })

  it('whitelists error codes instead of exporting raw exception text', () => {
    expect(safeScanError(new Error('auto_scroll_no_progress')))
      .toBe('auto_scroll_no_progress')
    expect(safeScanError(new Error('https://private.site/me')))
      .toBe('unclassified_error')
    expect(safeScanError(new Error('Another debugger is already attached to https://private.site/me')))
      .toBe('debugger_already_attached')
    expect(safeScanError(new Error('Extension context invalidated from https://private.site/me')))
      .toBe('extension_bridge_unavailable')
    expect(safeScanError({ message:'api-key-secret' }))
      .toBe('unclassified_error')
  })
})
