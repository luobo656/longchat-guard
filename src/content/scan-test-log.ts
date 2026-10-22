import type { ObservedMessageRecord } from '../core/types'
import type { HistoryScanDiagnostic, HistoryScanResult } from './history-scanner'
import type { WheelPassStep } from './auto-history-scroll'

export type ReadOperation = 'current_chat' | 'historical_calibration'
export type ReadMethod = 'manual' | 'auto'
export type PreparationStage = 'up' | 'down' | 'settle' | 'done' | 'verify' | 'save' | 'stopping'

type RunStatus =
  | 'running' | 'cancelled' | 'preparation_failed'
  | 'scanner_incomplete' | 'scanner_complete_not_saved'
  | 'parser_rejected' | 'commit_failed' | 'saved'

const DIAGNOSTIC_VERSION = 'LCG-READ-COMPARE-v1'
const MAX_RUNS = 4

/** Never interpolate arbitrary error.message, exception stacks or page content into a report. */
const SAFE_ERRORS = new Set([
  'auto_scroll_cancelled', 'auto_scroll_focus_lost', 'auto_scroll_navigation',
  'auto_scroll_user_interrupted', 'auto_scroll_no_timeline',
  'auto_scroll_target_obstructed', 'auto_scroll_bridge_timeout',
  'auto_scroll_bridge_unavailable', 'auto_scroll_no_progress',
  'auto_scroll_limit_reached', 'auto_scroll_dispatch_failed',
  'debug_scroll_failed', 'debug_scroll_busy', 'debug_scroll_wrong_session',
  'debug_scroll_not_attached', 'debug_scroll_timeout',
  'debug_scroll_tab_not_active', 'debug_scroll_window_not_focused',
  'debug_scroll_interrupted', 'unauthorized_sender', 'invalid_scroll_coordinates',
  'conversation_changed', 'conversation_changed_during_scan',
  'ledger_changed_during_scan', 'scan_session_replaced',
  'no_scroll_container', 'no_messages', 'head_not_stable',
  'tail_not_stable', 'window_alignment_failed', 'scan_limit_reached',
  'unknown_role', 'user_cancelled', 'user_declined_fallback'
])

const SAFE_PHASES = new Set<HistoryScanDiagnostic['phase']>([
  'start', 'settle_bottom', 'capture', 'scroll_up', 'wait_load',
  'top_probe', 'verify_tail', 'complete', 'failure', 'restore'
])
const SAFE_UNCERTAINTIES = new Set([
  'attachment', 'tool_result', 'web_search', 'code_execution',
  'voice', 'generated_image', 'unknown_context'
])

export function safeScanError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (SAFE_ERRORS.has(message)) return message
  // Chrome debugger APIs may use human-readable errors containing target details.
  // Classify familiar failure categories; NEVER return their original text.
  if (/another debugger|debugger is already attached/i.test(message)) {
    return 'debugger_already_attached'
  }
  if (/cannot attach|not permitted to debug|insufficient permissions/i.test(message)) {
    return 'debugger_attach_rejected'
  }
  if (/extension context invalidated|receiving end does not exist|message port closed/i.test(message)) {
    return 'extension_bridge_unavailable'
  }
  return 'unclassified_error'
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) &&
    Math.abs(value) < 1e12 ? Math.round(value) : null
}

interface ScrollPhaseSummary {
  wheelCommands: number
  movedCommands: number
  heightChanges: number
  boundaryObservations: number
  firstScrollTop: number | null
  lastScrollTop: number | null
  minScrollTop: number | null
  maxScrollTop: number | null
  maxScrollHeight: number | null
  lastScrollHeight: number | null
  lastAtBoundary: boolean
  samples: Array<{
    step: number
    scrollTop: number | null
    scrollHeight: number | null
    atBoundary: boolean
    moved: boolean
  }>
}

function newPhase(): ScrollPhaseSummary {
  return {
    wheelCommands: 0, movedCommands: 0, heightChanges: 0,
    boundaryObservations: 0, firstScrollTop: null,
    lastScrollTop: null, minScrollTop: null, maxScrollTop: null,
    maxScrollHeight: null, lastScrollHeight: null,
    lastAtBoundary: false, samples: []
  }
}

function sanitizeHistoryDiagnostics(events: HistoryScanDiagnostic[]) {
  const phaseCounts: Record<string, number> = {}
  for (const phase of SAFE_PHASES) phaseCounts[phase] = 0
  for (const item of events) {
    if (SAFE_PHASES.has(item.phase)) {
      phaseCounts[item.phase] = (phaseCounts[item.phase] ?? 0) + 1
    }
  }
  const first = events.slice(0, 3)
  const last = events.slice(-17)
  const selected = Array.from(new Set([...first, ...last]))
  const origin = events[0]?.at ?? 0
  return {
    recordedEvents: events.length,
    phaseCounts,
    highestObservedWindowMessages: events.reduce(
      (max, row) => Math.max(max, row.pageMessageCount ?? 0), 0
    ),
    highestReconstructedMessages: events.reduce(
      (max, row) => Math.max(max, row.totalMessageCount ?? 0), 0
    ),
    events: selected.map((row) => ({
      phase: SAFE_PHASES.has(row.phase) ? row.phase : 'failure',
      elapsedMs: numberOrNull(row.at - origin),
      step: numberOrNull(row.step),
      scrollTop: numberOrNull(row.scrollTop),
      scrollHeight: numberOrNull(row.scrollHeight),
      clientHeight: numberOrNull(row.clientHeight),
      logicalTop: numberOrNull(row.logicalTop),
      scrollMode: row.scrollMode === 'reversed' ? 'reversed' : 'normal',
      pageMessageCount: numberOrNull(row.pageMessageCount),
      observedCount: numberOrNull(row.observedCount),
      addedCount: numberOrNull(row.addedCount),
      totalMessageCount: numberOrNull(row.totalMessageCount),
      reason: row.reason && SAFE_ERRORS.has(row.reason)
        ? row.reason : null
      // The original surfaceHint is intentionally EXCLUDED: it can contain DOM metadata.
    }))
  }
}

async function aggregateDigest(records: ObservedMessageRecord[]): Promise<string | null> {
  if (!records.length) return null
  try {
    // The original per-message fingerprints are already locally salted.
    // Export ONLY an aggregate digest of the complete ordered sequence, never fingerprints.
    const normalized = records.map((message) =>
      message.role + ':' + message.contentFingerprint + ':' +
      message.tokenEstimate + ':' + message.charCount
    ).join('|')
    const hash = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(normalized)
    )
    return Array.from(new Uint8Array(hash))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

export class ScanTestAttempt {
  readonly startedAt = new Date().toISOString()
  private readonly startedMs = Date.now()
  private completedAt: string | null = null
  private durationMs: number | null = null
  private status: RunStatus = 'running'
  private mode: ReadMethod | 'not_selected' = 'not_selected'
  private effectiveMode: ReadMethod | 'none' = 'none'
  private autoFailure: string | null = null
  private finalError: string | null = null
  private manualTopConfirmed = false
  private manualBottomConfirmed = false
  private preparationStages: PreparationStage[] = []
  private scanner: Awaited<ReturnType<ScanTestAttempt['summarizeScanner']>> | null = null
  private ledgerUnits: number | null = null
  private readonly up = newPhase()
  private readonly down = newPhase()

  constructor(
    readonly operation: ReadOperation,
    /** Private only; deliberately never serialized. */
    readonly conversationIdentity: string
  ) {}

  choose(mode: ReadMethod): void {
    this.mode = mode
    this.effectiveMode = mode
  }

  manualTop(): void { this.manualTopConfirmed = true }
  manualBottom(): void { this.manualBottomConfirmed = true }
  stage(value: PreparationStage): void {
    this.preparationStages.push(value)
  }
  step(value: WheelPassStep): void {
    const stats = value.phase === 'up' ? this.up : this.down
    stats.wheelCommands += 1
    if (value.moved) stats.movedCommands += 1
    if (value.heightChanged) stats.heightChanges += 1
    if (value.atBoundary) stats.boundaryObservations += 1
    const top = numberOrNull(value.scrollTop)
    const height = numberOrNull(value.scrollHeight)
    if (top !== null) {
      stats.firstScrollTop ??= top
      stats.lastScrollTop = top
      stats.minScrollTop = Math.min(stats.minScrollTop ?? top, top)
      stats.maxScrollTop = Math.max(stats.maxScrollTop ?? top, top)
    }
    if (height !== null) {
      stats.lastScrollHeight = height
      stats.maxScrollHeight = Math.max(stats.maxScrollHeight ?? height, height)
    }
    stats.lastAtBoundary = value.atBoundary
    // A few geometric samples to diagnose which phase stalled; no message content.
    if (value.step === 0 || value.step % 30 === 0 ||
        (value.atBoundary && stats.samples.length < 25)) {
      stats.samples.push({
        step: value.step, scrollTop: top, scrollHeight: height,
        atBoundary: value.atBoundary, moved: value.moved
      })
      if (stats.samples.length > 25) stats.samples.shift()
    }
  }

  autoFailed(error: unknown): void {
    this.autoFailure = safeScanError(error)
    this.status = 'preparation_failed'
  }

  fallBackToManual(): void { this.effectiveMode = 'manual' }

  cancelled(code: 'user_cancelled' | 'user_declined_fallback' | 'auto_scroll_focus_lost'): void {
    this.status = 'cancelled'
    this.finalError = code
  }

  async scannerResult(result: HistoryScanResult): Promise<void> {
    this.scanner = await this.summarizeScanner(result)
    this.status = result.complete ? 'scanner_complete_not_saved' : 'scanner_incomplete'
    if (!result.complete) {
      this.finalError = result.reason && SAFE_ERRORS.has(result.reason)
        ? result.reason : 'scan_incomplete'
    }
  }

  parserRejected(): void {
    this.status = 'parser_rejected'
    this.finalError = 'unknown_role'
  }

  saved(units: number | undefined): void {
    this.status = 'saved'
    this.finalError = null
    this.ledgerUnits = numberOrNull(units)
  }

  failed(error: unknown): void {
    this.finalError = safeScanError(error)
    this.status = this.scanner ? 'commit_failed' : 'preparation_failed'
  }

  finish(): void {
    if (this.completedAt) return
    this.completedAt = new Date().toISOString()
    this.durationMs = Math.max(0, Date.now() - this.startedMs)
    if (this.status === 'running') {
      this.status = 'cancelled'
      this.finalError = 'user_cancelled'
    }
  }

  report(conversationGroup: string, ordinal: number) {
    return {
      run: ordinal,
      conversationGroup,
      operation: this.operation,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      durationMs: this.durationMs,
      selectedMode: this.mode,
      effectiveMode: this.effectiveMode,
      manualConfirmedTop: this.manualTopConfirmed,
      manualConfirmedBottom: this.manualBottomConfirmed,
      autoStages: [...this.preparationStages],
      autoFailureCode: this.autoFailure,
      autoWheel: { up: this.up, down: this.down },
      scanner: this.scanner,
      status: this.status,
      failureCode: this.finalError,
      committedLedgerEstimatedUnits: this.ledgerUnits,
      saved: this.status === 'saved'
    }
  }

  get comparisonValues() {
    return {
      status: this.status,
      scanner: this.scanner
    }
  }

  private async summarizeScanner(result: HistoryScanResult) {
    const records = result.observedMessages
    const counts = {
      user: records.filter((m) => m.role === 'user').length,
      assistant: records.filter((m) => m.role === 'assistant').length,
      unknown: records.filter((m) => m.role === 'unknown').length
    }
    const sums = {
      estimatedUnits: records.reduce((sum, m) => sum + m.tokenEstimate, 0),
      characters: records.reduce((sum, m) => sum + m.charCount, 0),
      codeMessages: records.filter((m) => m.hasCode).length
    }
    const [orderedDigest, firstDigest, lastDigest] = await Promise.all([
      aggregateDigest(records),
      aggregateDigest(records.slice(0, 12)),
      aggregateDigest(records.slice(-12))
    ])
    return {
      complete: result.complete,
      reason: result.reason && SAFE_ERRORS.has(result.reason) ? result.reason : null,
      reportedMessageCount: numberOrNull(result.messageCount),
      observedMessageCount: records.length,
      roleCounts: counts,
      totalEstimatedUnitsNotOfficialTokens: sums.estimatedUnits,
      totalCharacters: sums.characters,
      codeMessages: sums.codeMessages,
      attachmentCount: numberOrNull(result.attachmentCount),
      unknownRoleCount: numberOrNull(result.unknownRoleCount),
      uncertaintySources: result.uncertaintySources.filter((v) => SAFE_UNCERTAINTIES.has(v)),
      orderedSequenceDigest: orderedDigest,
      first12Digest: firstDigest,
      last12Digest: lastDigest,
      timeline: sanitizeHistoryDiagnostics(result.diagnostics)
    }
  }
}

export class ScanComparisonLog {
  private readonly records: ScanTestAttempt[] = []

  constructor(private readonly extensionVersion: string) {}

  start(operation: ReadOperation, conversationIdentity: string): ScanTestAttempt {
    return new ScanTestAttempt(operation, conversationIdentity)
  }

  complete(attempt: ScanTestAttempt): void {
    attempt.finish()
    if (this.records.includes(attempt)) return
    this.records.push(attempt)
    if (this.records.length > MAX_RUNS) this.records.shift()
  }

  hasReports(): boolean { return this.records.length > 0 }

  exportText(): string {
    const groups = new Map<string, string>()
    const reportRuns = this.records.map((attempt, i) => {
      let group = groups.get(attempt.conversationIdentity)
      if (!group) {
        group = 'conversation_' + (groups.size + 1)
        groups.set(attempt.conversationIdentity, group)
      }
      return attempt.report(group, i + 1)
    })
    let comparison: Record<string, unknown> = {
      available: false, reason: 'manual_and_auto_same_chat_required'
    }
    for (let i = this.records.length - 1; i >= 0; i--) {
      const automated = this.records[i]
      if (!automated || automated.report('', 0).selectedMode !== 'auto') continue
      for (let j = this.records.length - 1; j >= 0; j--) {
        const manual = this.records[j]
        if (!manual || manual === automated ||
            manual.conversationIdentity !== automated.conversationIdentity ||
            manual.report('', 0).selectedMode !== 'manual') continue
        const ms = manual.comparisonValues.scanner
        const as = automated.comparisonValues.scanner
        comparison = {
          available: true,
          manualRun: j + 1,
          automaticRun: i + 1,
          automaticFellBackToManual: automated.report('', 0).effectiveMode === 'manual',
          manualScanComplete: ms?.complete ?? false,
          automaticScanComplete: as?.complete ?? false,
          bothCommitted: manual.comparisonValues.status === 'saved' &&
            automated.comparisonValues.status === 'saved',
          messageCountDeltaAutoMinusManual: ms && as
            ? as.observedMessageCount - ms.observedMessageCount : null,
          estimatedUnitsDeltaAutoMinusManual: ms && as
            ? as.totalEstimatedUnitsNotOfficialTokens - ms.totalEstimatedUnitsNotOfficialTokens
            : null,
          sameOrderedDigest: ms?.orderedSequenceDigest && as?.orderedSequenceDigest
            ? ms.orderedSequenceDigest === as.orderedSequenceDigest : null,
          sameFirst12: ms?.first12Digest && as?.first12Digest
            ? ms.first12Digest === as.first12Digest : null,
          sameLast12: ms?.last12Digest && as?.last12Digest
            ? ms.last12Digest === as.last12Digest : null
        }
        break
      }
      if (comparison.available) break
    }
    return DIAGNOSTIC_VERSION + '\n' + JSON.stringify({
      format: DIAGNOSTIC_VERSION,
      version: this.extensionVersion,
      notes: [
        'Only anonymized statistics; user intentionally copied this report.',
        'No chat text, URLs, IDs or individual fingerprints.',
        'Estimated units use LongChat Guard internal measurement, not official OpenAI tokens.',
        'Records live only in the current page memory and disappear after page reload.'
      ],
      count: reportRuns.length,
      comparison,
      runs: reportRuns
    }, null, 2)
  }
}
