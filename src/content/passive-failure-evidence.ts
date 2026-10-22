import type { ErrorKind, EvidenceConfidence } from '../core/types'

/** Passive limit detection is not a substitute for explicit calibration.
 * Only attribute a newly surfaced failure to a submitted/accepted current turn.
 */
export const PASSIVE_LIMIT_EVIDENCE_TTL_MS = 15 * 60_000

export interface PassiveTurnProvenance {
  conversationKey?: string
  generationId: string
  accepted: boolean
  submitted?: boolean
  capturedAt: number
  lengthErrorVisibleAtStart?: boolean
}

export function shouldRecordPassiveLengthFailure(input: {
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  turn?: PassiveTurnProvenance | undefined
  conversationKey: string
  generationId: string
  observedAt: number
}): boolean {
  const { turn } = input
  if (input.errorKind !== 'conversation_length_limit' ||
      input.confidence !== 'high' ||
      (!turn?.accepted && !turn?.submitted) ||
      turn.lengthErrorVisibleAtStart === true ||
      turn.conversationKey !== input.conversationKey ||
      turn.generationId !== input.generationId) return false

  const elapsed = input.observedAt - turn.capturedAt
  return Number.isFinite(elapsed) &&
    elapsed >= 0 && elapsed <= PASSIVE_LIMIT_EVIDENCE_TTL_MS
}
