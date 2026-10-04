import type { ConversationControl, RiskState } from './types'

const STATE_RANK: Record<RiskState, number> = {
  unknown: -1,
  normal: 0,
  long: 1,
  organize: 2,
  high: 3
}

export function shouldDrawAttention(input: {
  state: RiskState
  control?: ConversationControl
}): boolean {
  const { state, control } = input
  if (control?.muted) return false
  if (state !== 'organize' && state !== 'high') return false

  const lastState = control?.lastAlertState
  return !lastState || STATE_RANK[state] > STATE_RANK[lastState]
}

export function withAlertRecorded(
  control: ConversationControl | undefined,
  state: RiskState
): ConversationControl {
  return {
    ...(control ?? {}),
    lastAlertState: state
  }
}
