import type { CoverageState, MessageRecord, ObservedMessageRecord, ParserHealth } from './types'

export type TailEvidence = 'at_tail' | 'not_tail' | 'unknown'
export type SequenceReliability = 'reliable' | 'uncertain'

export interface ReconcileInput {
  existingMessages: MessageRecord[]
  activeFingerprints: string[]
  observed: ObservedMessageRecord[]
  tailEvidence: TailEvidence
  coverageState: CoverageState
  parserHealth: ParserHealth
  now: number
}

export interface ReconcileResult {
  messages: MessageRecord[]
  activeFingerprints: string[]
  reliability: SequenceReliability
  uncertainReason?: string
  coverageState: CoverageState
  parserHealth: ParserHealth
}

export function reconcileSequence(input: ReconcileInput): ReconcileResult {
  const messagesById = new Map(input.existingMessages.map((message) => [message.fingerprint, message]))
  const activeRecords = input.activeFingerprints
    .map((fingerprint) => messagesById.get(fingerprint))
    .filter((record): record is MessageRecord => Boolean(record))
  const matched = matchObservedWindow(activeRecords, input.observed, input.now)
  for (const record of matched.records) {
    messagesById.set(record.fingerprint, record)
  }

  if (activeRecords.length === 0) {
    const activeFingerprints = matched.records.map((record) => record.fingerprint)
    return finish(input, Array.from(messagesById.values()), activeFingerprints, 'reliable')
  }

  const matchedFingerprints = matched.records.map((record) => record.fingerprint)
  const activeIds = activeRecords.map((record) => record.fingerprint)
  const contiguousStart = findContiguousSubsequence(activeIds, matchedFingerprints)
  if (contiguousStart >= 0) {
    return finish(input, Array.from(messagesById.values()), activeIds, 'reliable')
  }

  const overlap = longestSuffixPrefixOverlap(activeIds, matchedFingerprints)
  if (overlap > 0) {
    const nextActive = [...activeIds.slice(0, activeIds.length - overlap), ...matchedFingerprints]
    return finish(input, Array.from(messagesById.values()), nextActive, 'reliable')
  }

  const prefixOverlap = longestPrefixPrefixOverlap(activeRecords, matched.records)
  if (input.tailEvidence === 'at_tail' && prefixOverlap > 0) {
    const nextActive = [
      ...activeIds.slice(0, prefixOverlap),
      ...matchedFingerprints.slice(prefixOverlap)
    ]
    return finish(input, Array.from(messagesById.values()), nextActive, 'reliable')
  }

  const anchoredTailStart = findTailAnchorStart(activeIds, matchedFingerprints)
  if (input.tailEvidence === 'at_tail' && anchoredTailStart >= 0) {
    const nextActive = [
      ...activeIds.slice(0, anchoredTailStart),
      ...matchedFingerprints
    ]
    return finish(input, Array.from(messagesById.values()), nextActive, 'reliable')
  }

  return finish(
    input,
    Array.from(messagesById.values()),
    activeIds,
    'uncertain',
    'visible_window_did_not_align_reliably'
  )
}

function matchObservedWindow(
  activeRecords: MessageRecord[],
  observed: ObservedMessageRecord[],
  now: number
): { records: MessageRecord[] } {
  const used = new Set<string>()
  const records: MessageRecord[] = []
  let searchStart = 0
  for (const [index, item] of observed.entries()) {
    const match =
      matchByStableHint(activeRecords, item, used) ??
      matchByOrderedContent(activeRecords, item, used, searchStart)
    if (match) {
      used.add(match.fingerprint)
      searchStart = Math.max(searchStart, activeRecords.findIndex((record) => record.fingerprint === match.fingerprint) + 1)
      records.push(updateMatchedRecord(match, item))
      continue
    }

    const record: MessageRecord = {
      fingerprint: item.stableHintHash
        ? `stable:${item.stableHintHash}`
        : `local:${now}:${index}:${item.contentFingerprint.slice(0, 16)}`,
      contentFingerprint: item.contentFingerprint,
      role: item.role,
      tokenEstimate: item.tokenEstimate,
      charCount: item.charCount,
      observedAt: item.observedAt,
      localBranchId: 'active'
    }
    if (item.stableHintHash) record.stableHintHash = item.stableHintHash
    if (item.ordinalHint !== undefined) record.ordinalHint = item.ordinalHint
    if (item.hasCode !== undefined) record.hasCode = item.hasCode
    if (item.attachmentCount !== undefined) record.attachmentCount = item.attachmentCount
    records.push(record)
  }
  return { records }
}

function matchByStableHint(
  records: MessageRecord[],
  observed: ObservedMessageRecord,
  used: Set<string>
): MessageRecord | undefined {
  if (!observed.stableHintHash) return undefined
  return records.find((record) => {
    return record.stableHintHash === observed.stableHintHash && !used.has(record.fingerprint)
  })
}

function matchByOrderedContent(
  records: MessageRecord[],
  observed: ObservedMessageRecord,
  used: Set<string>,
  searchStart: number
): MessageRecord | undefined {
  return records.slice(searchStart).find((record) => {
    return (
      record.contentFingerprint === observed.contentFingerprint &&
      record.role === observed.role &&
      !used.has(record.fingerprint)
    )
  })
}

function updateMatchedRecord(record: MessageRecord, observed: ObservedMessageRecord): MessageRecord {
  const updated: MessageRecord = {
    ...record,
    contentFingerprint: observed.contentFingerprint,
    role: observed.role,
    tokenEstimate: observed.tokenEstimate,
    charCount: observed.charCount,
    lastObservedAt: observed.observedAt
  }
  if (observed.stableHintHash) updated.stableHintHash = observed.stableHintHash
  if (observed.ordinalHint !== undefined) updated.ordinalHint = observed.ordinalHint
  if (observed.hasCode !== undefined) updated.hasCode = observed.hasCode
  if (observed.attachmentCount !== undefined) updated.attachmentCount = observed.attachmentCount
  return updated
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

function longestPrefixPrefixOverlap(left: MessageRecord[], right: MessageRecord[]): number {
  const max = Math.min(left.length, right.length)
  let size = 0
  while (
    size < max &&
    left[size]?.contentFingerprint === right[size]?.contentFingerprint &&
    left[size]?.role === right[size]?.role
  ) {
    size += 1
  }
  return size
}

function findTailAnchorStart(activeIds: string[], visibleIds: string[]): number {
  if (visibleIds.length === 0) return -1
  const firstKnownIndex = visibleIds.findIndex((id) => activeIds.includes(id))
  if (firstKnownIndex < 0) return -1
  const activeStart = activeIds.indexOf(visibleIds[firstKnownIndex]!)
  for (let offset = firstKnownIndex; offset < visibleIds.length; offset += 1) {
    const visibleId = visibleIds[offset]
    if (!visibleId) return -1
    const activeId = activeIds[activeStart + offset - firstKnownIndex]
    if (activeId && visibleId !== activeId && activeIds.includes(visibleId)) return -1
  }
  return activeStart - firstKnownIndex
}

function finish(
  input: ReconcileInput,
  messages: MessageRecord[],
  activeFingerprints: string[],
  reliability: SequenceReliability,
  uncertainReason?: string
): ReconcileResult {
  const downgraded = reliability === 'uncertain'
  const result: ReconcileResult = {
    messages,
    activeFingerprints,
    reliability,
    coverageState: downgraded ? downgradeCoverage(input.coverageState) : input.coverageState,
    parserHealth: downgraded ? downgradeParserHealth(input.parserHealth) : input.parserHealth
  }
  if (uncertainReason) result.uncertainReason = uncertainReason
  return result
}

function downgradeCoverage(coverage: CoverageState): CoverageState {
  if (coverage === 'complete') return 'mostly_complete'
  if (coverage === 'mostly_complete') return 'incomplete'
  return coverage
}

function downgradeParserHealth(health: ParserHealth): ParserHealth {
  return health === 'healthy' ? 'degraded' : health
}
