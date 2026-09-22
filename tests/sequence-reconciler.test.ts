import { describe, expect, it } from 'vitest'
import { reconcileSequence } from '../src/core/sequence-reconciler'
import type { MessageRecord, ObservedMessageRecord } from '../src/core/types'

describe('sequence reconciler', () => {
  it('keeps full active sequence when DOM virtualization shows only a sub-window', () => {
    const existing = records(['m1', 'm2', 'm3', 'm4'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['m3', 'm4']),
      tailEvidence: 'unknown',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 10
    })

    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(load(result.messages, result.activeFingerprints)).toBe(40)
  })

  it('keeps hidden prefix and appends a new tail message when the visible tail overlaps', () => {
    const existing = records(['m1', 'm2', 'm3'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['m3', 'm4-new']),
      tailEvidence: 'at_tail',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 20
    })

    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).toEqual([
      'm1',
      'm2',
      'm3',
      'm4-new'
    ])
  })

  it('replaces an old regenerated assistant tail with the new tail when tail evidence is reliable', () => {
    const existing = records(['m1', 'old'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['m1', 'new']),
      tailEvidence: 'at_tail',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 30
    })

    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).toEqual(['m1', 'new'])
    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).not.toContain('old')
  })

  it('replaces a long-conversation regenerated tail using an arbitrary visible anchor', () => {
    const existing = records(['m1', 'm2', 'm3', 'old'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['m3', 'new']),
      tailEvidence: 'at_tail',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 35
    })

    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).toEqual([
      'm1',
      'm2',
      'm3',
      'new'
    ])
    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).not.toContain('old')
  })

  it('updates streaming content for a stable hinted message without changing instance id', () => {
    const existing: MessageRecord[] = [
      {
        fingerprint: 'stable:assistant-1',
        stableHintHash: 'assistant-1',
        contentFingerprint: 'short',
        role: 'assistant',
        tokenEstimate: 10,
        charCount: 20,
        observedAt: 1,
        localBranchId: 'active'
      }
    ]
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ['stable:assistant-1'],
      observed: [
        {
          stableHintHash: 'assistant-1',
          contentFingerprint: 'long',
          role: 'assistant',
          tokenEstimate: 100,
          charCount: 400,
          observedAt: 2,
          hasCode: true,
          attachmentCount: 1,
          ordinalHint: 0
        }
      ],
      tailEvidence: 'at_tail',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 60
    })

    expect(result.messages).toHaveLength(1)
    expect(result.activeFingerprints).toEqual(['stable:assistant-1'])
    expect(load(result.messages, result.activeFingerprints)).toBe(100)
    expect(result.messages[0]?.contentFingerprint).toBe('long')
    expect(result.messages[0]?.lastObservedAt).toBe(2)
    expect(result.messages[0]?.observedAt).toBe(1)
  })

  it('treats same role/text at different positions as two instances without stable hints', () => {
    const first = reconcileSequence({
      existingMessages: [],
      activeFingerprints: [],
      observed: observed(['continue', 'continue']),
      tailEvidence: 'at_tail',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 40
    })
    const second = reconcileSequence({
      existingMessages: first.messages,
      activeFingerprints: first.activeFingerprints,
      observed: observed(['continue', 'continue']),
      tailEvidence: 'at_tail',
      coverageState: first.coverageState,
      parserHealth: first.parserHealth,
      now: 41
    })

    expect(first.activeFingerprints).toHaveLength(2)
    expect(new Set(first.activeFingerprints).size).toBe(2)
    expect(second.activeFingerprints).toEqual(first.activeFingerprints)
    expect(second.messages).toHaveLength(2)
  })

  it('matches repeated content in strictly increasing order within the visible window', () => {
    const existing = records(['A', 'continue', 'B', 'continue', 'C'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['B', 'continue', 'C']),
      tailEvidence: 'unknown',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 70
    })

    expect(result.activeFingerprints).toEqual(ids(existing))
    expect(result.activeFingerprints[3]).toBe('i:3:continue')
    expect(result.messages).toHaveLength(5)
  })

  it('downgrades reliability instead of guessing when alignment is unsafe', () => {
    const existing = records(['m1', 'm2', 'm3'])
    const result = reconcileSequence({
      existingMessages: existing,
      activeFingerprints: ids(existing),
      observed: observed(['x', 'y']),
      tailEvidence: 'unknown',
      coverageState: 'complete',
      parserHealth: 'healthy',
      now: 50
    })

    expect(result.reliability).toBe('uncertain')
    expect(result.coverageState).toBe('mostly_complete')
    expect(result.parserHealth).toBe('degraded')
    expect(result.activeFingerprints.map((id) => contentOf(result.messages, id))).toEqual(['m1', 'm2', 'm3'])
  })
})

function records(contents: string[]): MessageRecord[] {
  return contents.map((content, index) => ({
    fingerprint: `i:${index}:${content}`,
    contentFingerprint: content,
    role: 'assistant',
    tokenEstimate: 10,
    charCount: content.length,
    observedAt: index,
    localBranchId: 'active'
  }))
}

function observed(contents: string[]): ObservedMessageRecord[] {
  return contents.map((content, index) => ({
    contentFingerprint: content,
    role: 'assistant',
    tokenEstimate: 10,
    charCount: content.length,
    observedAt: index
  }))
}

function ids(records: MessageRecord[]): string[] {
  return records.map((record) => record.fingerprint)
}

function contentOf(records: MessageRecord[], fingerprint: string): string | undefined {
  return records.find((record) => record.fingerprint === fingerprint)?.contentFingerprint
}

function load(records: MessageRecord[], active: string[]): number {
  return active.reduce((total, id) => {
    return total + (records.find((record) => record.fingerprint === id)?.tokenEstimate ?? 0)
  }, 0)
}
