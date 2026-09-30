import { reconcileSequence } from '../core/sequence-reconciler'
import type { MessageRecord, ObservedMessageRecord } from '../core/types'
import type { PageMessageSnapshot } from '../core/page-adapter'
import { findConversationScrollContainer, readMessages } from './dom-reader'

export type HistoryScanFailureReason =
  | 'no_scroll_container'
  | 'no_messages'
  | 'head_not_stable'
  | 'tail_not_stable'
  | 'window_alignment_failed'
  | 'scan_limit_reached'

export interface HistoryScanResult {
  complete: boolean
  reason?: HistoryScanFailureReason
  observedMessages: ObservedMessageRecord[]
  messageCount: number
  attachmentCount: number
  unknownRoleCount: number
}

export interface HistoryScanOptions {
  maxHeadRounds?: number
  maxSweepSteps?: number
  requiredStableRounds?: number
  stepRatio?: number
  settle?: () => Promise<void>
}

interface ScrollSurface {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

interface HistoryScanSource {
  surface: ScrollSurface
  readWindow(): PageMessageSnapshot[]
}

type ObserveWindow = (messages: PageMessageSnapshot[]) => Promise<ObservedMessageRecord[]>

const TOP_BOTTOM_TOLERANCE = 4

export async function scanConversationHistory(
  doc: Document,
  observeWindow: ObserveWindow,
  options: HistoryScanOptions = {}
): Promise<HistoryScanResult> {
  const surface = findConversationScrollContainer(doc)
  if (!surface) return emptyFailure('no_scroll_container')
  return scanHistorySource(
    {
      surface,
      readWindow: () => readMessages(doc)
    },
    observeWindow,
    options
  )
}

export async function scanHistorySource(
  source: HistoryScanSource,
  observeWindow: ObserveWindow,
  options: HistoryScanOptions = {}
): Promise<HistoryScanResult> {
  const maxHeadRounds = options.maxHeadRounds ?? 30
  const maxSweepSteps = options.maxSweepSteps ?? 500
  const requiredStableRounds = options.requiredStableRounds ?? 4
  const stepRatio = options.stepRatio ?? 0.42
  const settle = options.settle ?? defaultSettle
  const originalTop = source.surface.scrollTop

  let messages: MessageRecord[] = []
  let activeFingerprints: string[] = []
  let attachmentCount = 0

  const capture = async (tailEvidence: 'at_tail' | 'not_tail' | 'unknown') => {
    const pageMessages = source.readWindow()
    if (pageMessages.length === 0) return { ok: false as const, reason: 'no_messages' as const }
    const observed = await observeWindow(pageMessages)
    attachmentCount = Math.max(
      attachmentCount,
      observed.reduce((total, message) => total + (message.attachmentCount ?? 0), 0)
    )
    const reconciled = reconcileSequence({
      existingMessages: messages,
      activeFingerprints,
      observed,
      tailEvidence,
      coverageState: 'incomplete',
      parserHealth: 'healthy',
      now: Date.now()
    })
    if (reconciled.reliability !== 'reliable') {
      return { ok: false as const, reason: 'window_alignment_failed' as const }
    }
    messages = reconciled.messages
    activeFingerprints = reconciled.activeFingerprints
    return {
      ok: true as const,
      firstVisible: observed[0] ? observedIdentity(observed[0]) : '',
      lastVisible: observed.at(-1) ? observedIdentity(observed.at(-1)!) : ''
    }
  }

  try {
    let headStableRounds = 0
    let previousHeadIdentity = ''
    for (let round = 0; round < maxHeadRounds; round += 1) {
      source.surface.scrollTop = 0
      await settle()
      const captured = await capture('not_tail')
      if (!captured.ok) return resultFailure(captured.reason, messages, activeFingerprints, attachmentCount)

      const atTop = source.surface.scrollTop <= TOP_BOTTOM_TOLERANCE
      const sameHead = captured.firstVisible === previousHeadIdentity
      headStableRounds = atTop && sameHead ? headStableRounds + 1 : 0
      previousHeadIdentity = captured.firstVisible
      if (headStableRounds >= requiredStableRounds) break
    }
    if (headStableRounds < requiredStableRounds) {
      return resultFailure('head_not_stable', messages, activeFingerprints, attachmentCount)
    }
    const confirmedHeadIdentity = previousHeadIdentity

    let tailStableRounds = 0
    let previousTailIdentity = ''
    let lastSuccessfulTop = source.surface.scrollTop
    for (let step = 0; step < maxSweepSteps; step += 1) {
      const maxTop = Math.max(0, source.surface.scrollHeight - source.surface.clientHeight)
      const remaining = maxTop - source.surface.scrollTop
      const atBottom = remaining <= TOP_BOTTOM_TOLERANCE
      const captured = await capture(atBottom ? 'at_tail' : 'not_tail')
      if (!captured.ok) {
        const failedTop = source.surface.scrollTop
        const gap = failedTop - lastSuccessfulTop
        if (gap > 24) {
          source.surface.scrollTop = lastSuccessfulTop + Math.max(12, Math.floor(gap / 2))
          await settle()
          continue
        }
        return resultFailure(captured.reason, messages, activeFingerprints, attachmentCount)
      }
      lastSuccessfulTop = source.surface.scrollTop

      if (atBottom) {
        const sameTail = captured.lastVisible === previousTailIdentity
        tailStableRounds = sameTail ? tailStableRounds + 1 : 0
        previousTailIdentity = captured.lastVisible
        if (tailStableRounds >= requiredStableRounds) {
          source.surface.scrollTop = 0
          await settle()
          await settle()
          const headVerification = await capture('not_tail')
          if (!headVerification.ok) {
            return resultFailure(
              headVerification.reason,
              messages,
              activeFingerprints,
              attachmentCount
            )
          }
          if (
            source.surface.scrollTop > TOP_BOTTOM_TOLERANCE ||
            headVerification.firstVisible !== confirmedHeadIdentity
          ) {
            return resultFailure(
              'head_not_stable',
              messages,
              activeFingerprints,
              attachmentCount
            )
          }
          const metrics = scanMetrics(messages, activeFingerprints)
          return {
            complete: true,
            observedMessages: toObservedMessages(messages, activeFingerprints),
            messageCount: activeFingerprints.length,
            attachmentCount,
            unknownRoleCount: metrics.unknownRoleCount
          }
        }
        await settle()
        continue
      }

      const stepSize = Math.max(180, Math.floor(source.surface.clientHeight * stepRatio))
      const nextTop = Math.min(maxTop, source.surface.scrollTop + stepSize)
      source.surface.scrollTop = nextTop
      await settle()
    }

    return resultFailure(
      tailStableRounds > 0 ? 'tail_not_stable' : 'scan_limit_reached',
      messages,
      activeFingerprints,
      attachmentCount
    )
  } finally {
    source.surface.scrollTop = originalTop
  }
}

function toObservedMessages(
  messages: MessageRecord[],
  activeFingerprints: string[]
): ObservedMessageRecord[] {
  const byFingerprint = new Map(messages.map((message) => [message.fingerprint, message]))
  return activeFingerprints.flatMap((fingerprint, index) => {
    const message = byFingerprint.get(fingerprint)
    if (!message?.contentFingerprint) return []
    return [
      {
        contentFingerprint: message.contentFingerprint,
        ...(message.stableHintHash ? { stableHintHash: message.stableHintHash } : {}),
        role: message.role,
        tokenEstimate: message.tokenEstimate,
        charCount: message.charCount,
        observedAt: message.lastObservedAt ?? message.observedAt,
        ordinalHint: index,
        ...(message.hasCode !== undefined ? { hasCode: message.hasCode } : {}),
        ...(message.attachmentCount !== undefined
          ? { attachmentCount: message.attachmentCount }
          : {})
      }
    ]
  })
}

function observedIdentity(message: ObservedMessageRecord): string {
  return message.stableHintHash
    ? `stable:${message.stableHintHash}`
    : `${message.role}:${message.contentFingerprint}`
}

function resultFailure(
  reason: HistoryScanFailureReason,
  messages: MessageRecord[],
  activeFingerprints: string[],
  attachmentCount: number
): HistoryScanResult {
  const metrics = scanMetrics(messages, activeFingerprints)
  return {
    complete: false,
    reason,
    observedMessages: toObservedMessages(messages, activeFingerprints),
    messageCount: activeFingerprints.length,
    attachmentCount,
    unknownRoleCount: metrics.unknownRoleCount
  }
}

function emptyFailure(reason: HistoryScanFailureReason): HistoryScanResult {
  return {
    complete: false,
    reason,
    observedMessages: [],
    messageCount: 0,
    attachmentCount: 0,
    unknownRoleCount: 0
  }
}

function scanMetrics(
  messages: MessageRecord[],
  activeFingerprints: string[]
): { unknownRoleCount: number } {
  const byFingerprint = new Map(messages.map((message) => [message.fingerprint, message]))
  return {
    unknownRoleCount: activeFingerprints.reduce(
      (count, fingerprint) =>
        count + (byFingerprint.get(fingerprint)?.role === 'unknown' ? 1 : 0),
      0
    )
  }
}

async function defaultSettle(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 240))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
