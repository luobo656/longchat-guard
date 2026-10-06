import { environmentSignaturesMatch } from './product-state'
import type {
  CoverageState,
  EnvironmentSignature,
  ParserHealth,
  PersistedConversationLedger,
  SequenceReliability
} from './types'

export interface PassiveMeasurementCandidate {
  generationId: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  sequenceReliability: SequenceReliability
  environmentSignature: EnvironmentSignature
}

export type PassiveObservationDisposition =
  | 'commit'
  | 'retain_authoritative'

export function isAuthoritativeMeasurement(input: {
  coverageState: CoverageState
  parserHealth: ParserHealth
  sequenceReliability: SequenceReliability
}): boolean {
  return (
    input.coverageState === 'complete' &&
    input.parserHealth === 'healthy' &&
    input.sequenceReliability === 'reliable'
  )
}

export function isAuthoritativeLedgerForEnvironment(input: {
  ledger: PersistedConversationLedger | undefined
  generationId: string
  environmentSignature: EnvironmentSignature
}): boolean {
  const ledger = input.ledger
  return Boolean(
    ledger &&
      ledger.generationId === input.generationId &&
      isAuthoritativeMeasurement(ledger) &&
      environmentSignaturesMatch(
        ledger.environmentSignature,
        input.environmentSignature
      )
  )
}

export function passiveObservationDisposition(input: {
  existing: PersistedConversationLedger | undefined
  candidate: PassiveMeasurementCandidate
}): PassiveObservationDisposition {
  if (
    isAuthoritativeLedgerForEnvironment({
      ledger: input.existing,
      generationId: input.candidate.generationId,
      environmentSignature: input.candidate.environmentSignature
    }) &&
    !isAuthoritativeMeasurement(input.candidate)
  ) {
    return 'retain_authoritative'
  }
  return 'commit'
}
