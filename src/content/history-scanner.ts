import type {
  ObservedMessageRecord,
  UncertaintySource
} from '../core/types'
import type { PageMessageSnapshot } from '../core/page-adapter'
import { findConversationScrollContainer, readMessages } from './dom-reader'
import { detectUncertaintySources } from './environment'

export type HistoryScanFailureReason =
  | 'no_scroll_container'
  | 'no_messages'
  | 'head_not_stable'
  | 'tail_not_stable'
  | 'window_alignment_failed'
  | 'scan_limit_reached'

export interface HistoryScanDiagnostic {
  at: number
  phase:
    | 'start'
    | 'settle_bottom'
    | 'capture'
    | 'scroll_up'
    | 'wait_load'
    | 'top_probe'
    | 'verify_tail'
    | 'complete'
    | 'failure'
    | 'restore'
  step?: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  logicalTop?: number
  scrollMode?: 'normal' | 'reversed'
  pageMessageCount?: number
  observedCount?: number
  addedCount?: number
  totalMessageCount?: number
  reason?: HistoryScanFailureReason
  surfaceHint?: string
}

export interface HistoryScanResult {
  complete: boolean
  reason?: HistoryScanFailureReason
  observedMessages: ObservedMessageRecord[]
  messageCount: number
  attachmentCount: number
  uncertaintySources: UncertaintySource[]
  unknownRoleCount: number
  diagnostics: HistoryScanDiagnostic[]
}

export interface HistoryScanOptions {
  maxHeadRounds?: number
  requiredHeadStableRounds?: number
  maxSweepSteps?: number
  requiredStableRounds?: number
  maxEmptyWindowRetries?: number
  maxAlignmentRetries?: number
  stepRatio?: number
  settle?: () => Promise<void>
  headSettle?: () => Promise<void>
}

interface ScrollSurface {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

interface HistoryScanSource {
  surface: ScrollSurface
  readWindow(): PageMessageSnapshot[]
  readUncertaintySources?(): UncertaintySource[]
  notifyScroll?(): void
  surfaceHint?: string
  scrollMode?: 'normal' | 'reversed'
}

type ObserveWindow = (messages: PageMessageSnapshot[]) => Promise<ObservedMessageRecord[]>

const TOP_BOTTOM_TOLERANCE = 4
const MAX_DIAGNOSTICS = 240
const HEIGHT_STABLE_ROUNDS = 3
const MAX_HEIGHT_SETTLE_CHECKS = 12

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
      readWindow: () => readMessages(doc),
      readUncertaintySources: () => detectUncertaintySources(doc),
      notifyScroll: () => surface.dispatchEvent(new Event('scroll', { bubbles: true })),
      surfaceHint: describeScrollSurface(surface, doc),
      scrollMode: detectScrollMode(surface)
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
  const maxHeadRounds = options.maxHeadRounds ?? 32
  const maxSweepSteps = options.maxSweepSteps ?? 2000
  const requiredStableRounds = options.requiredStableRounds ?? 3
  const requiredHeadStableRounds = options.requiredHeadStableRounds ?? 4
  const maxEmptyWindowRetries = options.maxEmptyWindowRetries ?? 4
  const maxAlignmentRetries = options.maxAlignmentRetries ?? 6
  const stepRatio = options.stepRatio ?? 0.6
  const settle = options.settle ?? defaultSettle
  const headSettle = options.headSettle ?? (options.settle ? settle : defaultHeadSettle)
  const scrollMode = source.scrollMode ?? 'normal'
  const diagnostics: HistoryScanDiagnostic[] = []
  const recordsByIdentity = new Map<string, ObservedMessageRecord>()
  let activeIdentities: string[] = []
  let attachmentCount = 0
  const uncertaintySources = new Set<UncertaintySource>()

  const maxTop = (): number =>
    Math.max(0, source.surface.scrollHeight - source.surface.clientHeight)

  const logicalTop = (): number => {
    const max = maxTop()
    return scrollMode === 'reversed'
      ? Math.max(0, Math.min(max, source.surface.scrollTop + max))
      : Math.max(0, Math.min(max, source.surface.scrollTop))
  }

  const originalDistanceFromBottom = maxTop() - logicalTop()

  const record = (
    phase: HistoryScanDiagnostic['phase'],
    detail: Omit<
      HistoryScanDiagnostic,
      'at' | 'phase' | 'scrollTop' | 'scrollHeight' | 'clientHeight'
    > = {}
  ): void => {
    const event: HistoryScanDiagnostic = {
      at: Date.now(),
      phase,
      scrollTop: source.surface.scrollTop,
      scrollHeight: source.surface.scrollHeight,
      clientHeight: source.surface.clientHeight,
      logicalTop: logicalTop(),
      scrollMode,
      ...detail
    }
    diagnostics.push(event)
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift()
  }

  const moveSurface = (top: number): void => {
    const max = maxTop()
    const clampedTop = Math.max(0, Math.min(max, top))
    source.surface.scrollTop = scrollMode === 'reversed' ? clampedTop - max : clampedTop
    source.notifyScroll?.()
  }

  const buildObservedMessages = (): ObservedMessageRecord[] =>
    activeIdentities.flatMap((identity, index) => {
      const message = recordsByIdentity.get(identity)
      if (!message) return []
      return [{ ...message, ordinalHint: index }]
    })

  const result = (
    complete: boolean,
    reason?: HistoryScanFailureReason
  ): HistoryScanResult => {
    const observedMessages = buildObservedMessages()
    const unknownRoleCount = observedMessages.reduce(
      (count, message) => count + (message.role === 'unknown' ? 1 : 0),
      0
    )
    return {
      complete,
      ...(reason ? { reason } : {}),
      observedMessages,
      messageCount: observedMessages.length,
      attachmentCount,
      uncertaintySources: [...uncertaintySources],
      unknownRoleCount,
      diagnostics: [...diagnostics]
    }
  }

  const fail = (reason: HistoryScanFailureReason, step?: number): HistoryScanResult => {
    record('failure', {
      ...(step !== undefined ? { step } : {}),
      reason,
      totalMessageCount: activeIdentities.length
    })
    return result(false, reason)
  }

  const readObservedWindow = async (
    phase: HistoryScanDiagnostic['phase'],
    step?: number,
    waitForEmpty: () => Promise<void> = settle
  ): Promise<
    | { ok: true; observed: ObservedMessageRecord[]; pageMessageCount: number }
    | { ok: false; reason: 'no_messages' }
  > => {
    let pageMessages = source.readWindow()
    let retries = 0
    while (pageMessages.length === 0 && retries < maxEmptyWindowRetries) {
      record(phase, {
        ...(step !== undefined ? { step } : {}),
        pageMessageCount: 0,
        totalMessageCount: activeIdentities.length
      })
      retries += 1
      await waitForEmpty()
      pageMessages = source.readWindow()
    }
    if (pageMessages.length === 0) return { ok: false, reason: 'no_messages' }

    for (const uncertaintySource of source.readUncertaintySources?.() ?? []) {
      uncertaintySources.add(uncertaintySource)
    }
    const observed = await observeWindow(pageMessages)
    record(phase, {
      ...(step !== undefined ? { step } : {}),
      pageMessageCount: pageMessages.length,
      observedCount: observed.length,
      totalMessageCount: activeIdentities.length
    })
    if (observed.length === 0) return { ok: false, reason: 'no_messages' }

    attachmentCount = Math.max(
      attachmentCount,
      observed.reduce((total, message) => total + (message.attachmentCount ?? 0), 0)
    )
    return { ok: true, observed, pageMessageCount: pageMessages.length }
  }

  const mergeBackwardWindow = (
    observed: ObservedMessageRecord[]
  ):
    | { ok: true; addedCount: number; firstVisible: string; lastVisible: string }
    | { ok: false; reason: 'window_alignment_failed' } => {
    const identities = observed.map(observedIdentity)
    if (new Set(identities).size !== identities.length) {
      return { ok: false, reason: 'window_alignment_failed' }
    }

    observed.forEach((message, index) => {
      const identity = identities[index]
      if (identity) recordsByIdentity.set(identity, message)
    })

    if (activeIdentities.length === 0) {
      activeIdentities = [...identities]
      return {
        ok: true,
        addedCount: identities.length,
        firstVisible: identities[0] ?? '',
        lastVisible: identities.at(-1) ?? ''
      }
    }

    if (findContiguousSubsequence(activeIdentities, identities) >= 0) {
      return {
        ok: true,
        addedCount: 0,
        firstVisible: identities[0] ?? '',
        lastVisible: identities.at(-1) ?? ''
      }
    }

    const overlap = longestSuffixPrefixOverlap(identities, activeIdentities)
    if (overlap <= 0) return { ok: false, reason: 'window_alignment_failed' }

    const prefix = identities.slice(0, identities.length - overlap)
    if (prefix.some((identity) => activeIdentities.includes(identity))) {
      return { ok: false, reason: 'window_alignment_failed' }
    }

    activeIdentities = [...prefix, ...activeIdentities]
    return {
      ok: true,
      addedCount: prefix.length,
      firstVisible: identities[0] ?? '',
      lastVisible: identities.at(-1) ?? ''
    }
  }

  const captureBackward = async (
    phase: HistoryScanDiagnostic['phase'],
    step?: number,
    waitForEmpty: () => Promise<void> = settle
  ): Promise<
    | {
        ok: true
        addedCount: number
        firstVisible: string
        lastVisible: string
      }
    | { ok: false; reason: HistoryScanFailureReason }
  > => {
    const read = await readObservedWindow(phase, step, waitForEmpty)
    if (!read.ok) return read
    const merged = mergeBackwardWindow(read.observed)
    if (!merged.ok) return merged
    record('capture', {
      ...(step !== undefined ? { step } : {}),
      pageMessageCount: read.pageMessageCount,
      observedCount: read.observed.length,
      addedCount: merged.addedCount,
      totalMessageCount: activeIdentities.length
    })
    return merged
  }

  const waitForHeightStability = async (step: number): Promise<number> => {
    let lastHeight = source.surface.scrollHeight
    let stableRounds = 0
    for (let check = 0; check < MAX_HEIGHT_SETTLE_CHECKS; check += 1) {
      await settle()
      const height = source.surface.scrollHeight
      stableRounds = height === lastHeight ? stableRounds + 1 : 0
      lastHeight = height
      record('wait_load', { step, totalMessageCount: activeIdentities.length })
      if (stableRounds >= HEIGHT_STABLE_ROUNDS) break
    }
    return lastHeight
  }

  const settleAtBottom = async (): Promise<boolean> => {
    let stableRounds = 0
    let lastHeight = -1
    const checks = Math.max(requiredStableRounds * 4, 8)
    for (let check = 0; check < checks; check += 1) {
      moveSurface(maxTop())
      await settle()
      const height = source.surface.scrollHeight
      const atBottom = maxTop() - logicalTop() <= TOP_BOTTOM_TOLERANCE
      stableRounds = atBottom && height === lastHeight ? stableRounds + 1 : 0
      lastHeight = height
      record('settle_bottom', { step: check, totalMessageCount: activeIdentities.length })
      if (stableRounds >= requiredStableRounds) return true
    }
    return false
  }

  const sweepToStableTop = async (): Promise<
    | { ok: true }
    | { ok: false; reason: HistoryScanFailureReason; step?: number }
  > => {
    let topStableRounds = 0

    for (let step = 0; step < maxSweepSteps; step += 1) {
      const beforeHeight = source.surface.scrollHeight
      const beforeTop = logicalTop()
      const stepSize = Math.max(200, Math.floor(source.surface.clientHeight * stepRatio))
      const nextTop = Math.max(0, beforeTop - stepSize)
      moveSurface(nextTop)
      record('scroll_up', { step, totalMessageCount: activeIdentities.length })

      await waitForHeightStability(step)

      let captured = await captureBackward(
        'capture',
        step,
        logicalTop() <= TOP_BOTTOM_TOLERANCE ? headSettle : settle
      )
      if (!captured.ok && captured.reason === 'window_alignment_failed') {
        const originalStep = Math.max(1, beforeTop - nextTop)
        for (let retry = 1; retry <= maxAlignmentRetries; retry += 1) {
          const reducedStep = Math.max(24, Math.floor(originalStep / (2 ** retry)))
          const recoveryTop = Math.max(nextTop, beforeTop - reducedStep)
          moveSurface(recoveryTop)
          record('scroll_up', { step, totalMessageCount: activeIdentities.length })
          await waitForHeightStability(step)
          captured = await captureBackward(
            'capture',
            step,
            logicalTop() <= TOP_BOTTOM_TOLERANCE ? headSettle : settle
          )
          if (captured.ok || captured.reason !== 'window_alignment_failed') break
        }
      }
      if (!captured.ok) return { ok: false, reason: captured.reason, step }

      const atTop = logicalTop() <= TOP_BOTTOM_TOLERANCE
      const noProgress =
        captured.addedCount === 0 && source.surface.scrollHeight === beforeHeight

      if (atTop && noProgress) {
        topStableRounds += 1
      } else {
        topStableRounds = 0
      }

      if (atTop && topStableRounds >= requiredStableRounds) return { ok: true }
    }

    return { ok: false, reason: 'scan_limit_reached' }
  }

  const reconnectAfterPrependedHistory = async (
    insertedHeight: number,
    round: number
  ): Promise<{ ok: true } | { ok: false; reason: HistoryScanFailureReason }> => {
    const halfViewport = Math.max(48, Math.floor(source.surface.clientHeight / 2))
    const expectedAnchorTop = Math.max(0, Math.min(maxTop(), insertedHeight))
    const candidates = [
      expectedAnchorTop,
      expectedAnchorTop - halfViewport,
      expectedAnchorTop + halfViewport,
      expectedAnchorTop - source.surface.clientHeight,
      expectedAnchorTop + source.surface.clientHeight,
      logicalTop()
    ]
      .map((value) => Math.max(0, Math.min(maxTop(), Math.round(value))))
      .filter((value, index, values) => values.indexOf(value) === index)

    for (const candidate of candidates) {
      moveSurface(candidate)
      record('scroll_up', { step: round, totalMessageCount: activeIdentities.length })
      await waitForHeightStability(round)
      const captured = await captureBackward('top_probe', round, settle)
      if (captured.ok) return { ok: true }
      if (captured.reason !== 'window_alignment_failed') return captured
    }

    return { ok: false, reason: 'window_alignment_failed' }
  }

  record('start', source.surfaceHint ? { surfaceHint: source.surfaceHint } : {})

  try {
    if (!(await settleAtBottom())) return fail('tail_not_stable')

    const initial = await captureBackward('capture')
    if (!initial.ok) return fail(initial.reason)
    const confirmedTailIdentity = initial.lastVisible
    if (!confirmedTailIdentity) return fail('no_messages')

    const initialSweep = await sweepToStableTop()
    if (!initialSweep.ok) return fail(initialSweep.reason, initialSweep.step)

    let confirmedHeadIdentity = ''
    let previousHeadHeight = -1
    let headStableRounds = 0

    for (let round = 0; round < maxHeadRounds; round += 1) {
      const heightBeforeProbe = source.surface.scrollHeight
      moveSurface(10)
      await settle()
      moveSurface(0)
      await headSettle()

      const heightAfterProbe = source.surface.scrollHeight
      const insertedHeight = Math.max(0, heightAfterProbe - heightBeforeProbe)
      if (insertedHeight > 0) {
        const reconnected = await reconnectAfterPrependedHistory(insertedHeight, round)
        if (!reconnected.ok) return fail(reconnected.reason, round)
        const expandedSweep = await sweepToStableTop()
        if (!expandedSweep.ok) return fail(expandedSweep.reason, expandedSweep.step)
        confirmedHeadIdentity = ''
        previousHeadHeight = source.surface.scrollHeight
        headStableRounds = 0
        continue
      }

      moveSurface(0)
      await settle()
      const captured = await captureBackward('top_probe', round, headSettle)
      if (!captured.ok) return fail(captured.reason, round)

      const sameHead = captured.firstVisible === confirmedHeadIdentity
      const sameHeight = source.surface.scrollHeight === previousHeadHeight
      const atTop = logicalTop() <= TOP_BOTTOM_TOLERANCE
      headStableRounds =
        atTop && sameHead && sameHeight && captured.addedCount === 0
          ? headStableRounds + 1
          : 0
      confirmedHeadIdentity = captured.firstVisible
      previousHeadHeight = source.surface.scrollHeight

      if (headStableRounds >= requiredHeadStableRounds) break
    }

    if (headStableRounds < requiredHeadStableRounds || !confirmedHeadIdentity) {
      return fail('head_not_stable')
    }

    if (!(await settleAtBottom())) return fail('tail_not_stable')

    const tailRead = await readObservedWindow('verify_tail')
    if (!tailRead.ok) return fail(tailRead.reason)
    const tailIdentities = tailRead.observed.map(observedIdentity)
    const tailStart = findContiguousSubsequence(activeIdentities, tailIdentities)
    const tailMatches =
      tailStart >= 0 &&
      tailIdentities.at(-1) === confirmedTailIdentity &&
      tailIdentities.at(-1) === activeIdentities.at(-1)

    record('verify_tail', {
      observedCount: tailRead.observed.length,
      totalMessageCount: activeIdentities.length
    })

    if (!tailMatches) return fail('tail_not_stable')

    record('complete', { totalMessageCount: activeIdentities.length })
    return result(true)
  } finally {
    moveSurface(Math.max(0, maxTop() - originalDistanceFromBottom))
    record('restore', { totalMessageCount: activeIdentities.length })
  }
}

function detectScrollMode(surface: HTMLElement): 'normal' | 'reversed' {
  const originalTop = surface.scrollTop
  try {
    surface.scrollTop = -1
    const reversed = surface.scrollTop < 0
    surface.scrollTop = originalTop
    return reversed ? 'reversed' : 'normal'
  } catch {
    try { surface.scrollTop = originalTop } catch {}
    return 'normal'
  }
}

function describeScrollSurface(surface: HTMLElement, doc: Document): string {
  if (surface === doc.scrollingElement) return `document.scrollingElement:${surface.tagName.toLowerCase()}`
  if (surface === doc.documentElement) return `document.documentElement:${surface.tagName.toLowerCase()}`
  if (surface === doc.body) return `document.body:${surface.tagName.toLowerCase()}`
  const tag = surface.tagName.toLowerCase()
  const role = surface.getAttribute('role')?.trim()
  const id = surface.id.trim()
  const classes = Array.from(surface.classList).slice(0, 4).join('.')
  return [tag, id ? `#${id}` : '', classes ? `.${classes}` : '', role ? `[role=${role}]` : ''].join('')
}

function observedIdentity(message: ObservedMessageRecord): string {
  return message.stableHintHash
    ? `stable:${message.stableHintHash}`
    : `${message.role}:${message.contentFingerprint}`
}

function findContiguousSubsequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return -1
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((value, offset) => haystack[start + offset] === value)) return start
  }
  return -1
}

function longestSuffixPrefixOverlap(left: string[], right: string[]): number {
  const max = Math.min(left.length, right.length)
  for (let size = max; size > 0; size -= 1) {
    if (left.slice(left.length - size).every((value, index) => value === right[index])) {
      return size
    }
  }
  return 0
}

function emptyFailure(reason: HistoryScanFailureReason): HistoryScanResult {
  return {
    complete: false,
    reason,
    observedMessages: [],
    messageCount: 0,
    attachmentCount: 0,
    uncertaintySources: [],
    unknownRoleCount: 0,
    diagnostics: [
      {
        at: Date.now(),
        phase: 'failure',
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        reason
      }
    ]
  }
}

async function defaultSettle(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function defaultHeadSettle(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 1200))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
