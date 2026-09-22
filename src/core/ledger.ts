import type {
  CoverageState,
  MessageRecord,
  ParserHealth,
  PersistedConversationLedger
} from './types'

export interface BranchSnapshot {
  branchId: string
  fingerprints: string[]
}

export class AnonymousConversationLedger {
  private readonly records = new Map<string, MessageRecord>()
  private activeFingerprints: string[] = []

  static fromSnapshot(snapshot: PersistedConversationLedger): AnonymousConversationLedger {
    const ledger = new AnonymousConversationLedger()
    for (const record of snapshot.messages) {
      ledger.observe(record)
    }
    ledger.setActiveSequence(snapshot.activeFingerprints)
    return ledger
  }

  observe(record: MessageRecord): void {
    if (!this.records.has(record.fingerprint)) {
      this.records.set(record.fingerprint, record)
    }
  }

  /**
   * Reconciles the currently observed active sequence.
   * This avoids permanently summing regenerated/edited branches together.
   */
  setActiveSequence(fingerprints: string[]): void {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const fingerprint of fingerprints) {
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint)
        unique.push(fingerprint)
      }
    }
    this.activeFingerprints = unique
  }

  estimatedActiveLoad(): number {
    return this.activeFingerprints.reduce((total, fingerprint) => {
      return total + (this.records.get(fingerprint)?.tokenEstimate ?? 0)
    }, 0)
  }

  has(fingerprint: string): boolean {
    return this.records.has(fingerprint)
  }

  size(): number {
    return this.records.size
  }

  recordsArray(): MessageRecord[] {
    return Array.from(this.records.values()).sort((a, b) => {
      return a.observedAt - b.observedAt || a.fingerprint.localeCompare(b.fingerprint)
    })
  }

  activeSequence(): string[] {
    return [...this.activeFingerprints]
  }

  merge(other: AnonymousConversationLedger): void {
    for (const record of other.recordsArray()) {
      this.observe(record)
    }
    if (other.activeSequence().length > 0) {
      this.setActiveSequence(other.activeSequence())
    }
  }

  toSnapshot(input: {
    conversationKey: string
    generationId: string
    coverageState: CoverageState
    parserHealth: ParserHealth
    updatedAt: number
  }): PersistedConversationLedger {
    return {
      conversationKey: input.conversationKey,
      generationId: input.generationId,
      coverageState: input.coverageState,
      parserHealth: input.parserHealth,
      messages: this.recordsArray(),
      activeFingerprints: this.activeSequence(),
      currentEstimatedLoad: this.estimatedActiveLoad(),
      updatedAt: input.updatedAt
    }
  }
}
