import { describe, expect, it } from 'vitest'
import {
  isAuthoritativeLedgerForEnvironment,
  isAuthoritativeMeasurement,
  passiveObservationDisposition
} from '../src/core/measurement-authority'
import type { PersistedConversationLedger } from '../src/core/types'

const environment = {
  parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
  measurementSchemaVersion: 2
}

function ledger(
  overrides: Partial<PersistedConversationLedger> = {}
): PersistedConversationLedger {
  return {
    conversationKey: 'chat',
    generationId: 'g1',
    ledgerRevision: 3,
    observationEpoch: 10,
    coverageState: 'complete',
    parserHealth: 'healthy',
    messages: [],
    activeFingerprints: [],
    sequenceReliability: 'reliable',
    currentEstimatedLoad: 100,
    uncertaintySources: [],
    environmentSignature: environment,
    completedAssistantFingerprints: [],
    confirmedFailureFingerprints: [],
    dismissedFailureKeys: [],
    updatedAt: 10,
    ...overrides
  }
}

describe('passive measurement authority', () => {
  it('defines authority only from complete + healthy + reliable measurement', () => {
    expect(
      isAuthoritativeMeasurement({
        coverageState: 'complete',
        parserHealth: 'healthy',
        sequenceReliability: 'reliable'
      })
    ).toBe(true)
    expect(
      isAuthoritativeMeasurement({
        coverageState: 'incomplete',
        parserHealth: 'healthy',
        sequenceReliability: 'reliable'
      })
    ).toBe(false)
    expect(
      isAuthoritativeMeasurement({
        coverageState: 'complete',
        parserHealth: 'degraded',
        sequenceReliability: 'reliable'
      })
    ).toBe(false)
    expect(
      isAuthoritativeMeasurement({
        coverageState: 'complete',
        parserHealth: 'healthy',
        sequenceReliability: 'uncertain'
      })
    ).toBe(false)
  })

  it('retains an authoritative ledger when a passive candidate is weaker', () => {
    expect(
      passiveObservationDisposition({
        existing: ledger(),
        candidate: {
          generationId: 'g1',
          coverageState: 'incomplete',
          parserHealth: 'degraded',
          sequenceReliability: 'uncertain',
          environmentSignature: environment
        }
      })
    ).toBe('retain_authoritative')
  })

  it('commits a new authoritative candidate', () => {
    expect(
      passiveObservationDisposition({
        existing: ledger(),
        candidate: {
          generationId: 'g1',
          coverageState: 'complete',
          parserHealth: 'healthy',
          sequenceReliability: 'reliable',
          environmentSignature: environment
        }
      })
    ).toBe('commit')
  })

  it('does not preserve an old authoritative ledger across measurement-environment changes', () => {
    expect(
      passiveObservationDisposition({
        existing: ledger(),
        candidate: {
          generationId: 'g1',
          coverageState: 'incomplete',
          parserHealth: 'degraded',
          sequenceReliability: 'uncertain',
          environmentSignature: {
            parserSchemaVersion: 'chatgpt-dom-2026-10-v4',
            measurementSchemaVersion: 2
          }
        }
      })
    ).toBe('commit')
  })

  it('allows provisional observations when no authoritative ledger exists yet', () => {
    expect(
      passiveObservationDisposition({
        existing: ledger({ coverageState: 'incomplete' }),
        candidate: {
          generationId: 'g1',
          coverageState: 'incomplete',
          parserHealth: 'healthy',
          sequenceReliability: 'reliable',
          environmentSignature: environment
        }
      })
    ).toBe('commit')
  })

  it('checks generation and environment before treating a persisted ledger as authoritative', () => {
    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: ledger(),
        generationId: 'g1',
        environmentSignature: environment
      })
    ).toBe(true)
    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: ledger(),
        generationId: 'g2',
        environmentSignature: environment
      })
    ).toBe(false)
  })
})
