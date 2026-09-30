import { describe, expect, it } from 'vitest'
import {
  buildStoredScanDiagnostics,
  shouldDiscardStoredScanDiagnostics
} from '../src/content/app'
import type { HistoryScanResult } from '../src/content/history-scanner'

function result(complete: boolean): HistoryScanResult {
  return {
    complete,
    ...(complete ? {} : { reason: 'head_not_stable' as const }),
    observedMessages: [],
    messageCount: 12,
    attachmentCount: 0,
    unknownRoleCount: 0,
    diagnostics: Array.from({ length: 8 }, (_, index) => ({
      at: index,
      phase: 'capture' as const,
      step: index,
      scrollTop: index * 10,
      scrollHeight: 1000,
      clientHeight: 500,
      logicalTop: index * 10,
      scrollMode: 'normal' as const,
      pageMessageCount: 3,
      observedCount: 3,
      totalMessageCount: index + 1
    }))
  }
}

describe('scan diagnostics privacy lifecycle', () => {
  it('keeps no diagnostic record after a successful scan', () => {
    expect(buildStoredScanDiagnostics(result(true), 1000)).toBeUndefined()
  })

  it('stores only a bounded failure summary without URL or conversation payload fields', () => {
    const saved = buildStoredScanDiagnostics(result(false), 1000, 'short failure')
    expect(saved?.version).toBe(2)
    expect(saved?.reason).toBe('head_not_stable')
    expect(saved?.stages).toHaveLength(6)
    expect(saved).not.toHaveProperty('url')
    expect(saved).not.toHaveProperty('conversationKey')
    expect(saved).not.toHaveProperty('messageCount')
    expect(JSON.stringify(saved)).not.toContain('chatgpt.com')
  })

  it('expires diagnostics after seven days and rejects legacy versions', () => {
    const saved = buildStoredScanDiagnostics(result(false), 1000)!
    expect(shouldDiscardStoredScanDiagnostics(saved, 1000 + 6 * 24 * 60 * 60 * 1000)).toBe(false)
    expect(shouldDiscardStoredScanDiagnostics(saved, 1000 + 8 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(shouldDiscardStoredScanDiagnostics({ ...saved, version: 1 }, 1001)).toBe(true)
  })
})
