import { describe, expect, it } from 'vitest'
import { shouldRecordPassiveLengthFailure } from '../src/content/passive-failure-evidence'
import { classifyVisibleError } from '../src/core/error-classifier'

const turn = {
  accepted: true,
  conversationKey: 'anonymous-current-chat',
  generationId: 'g1',
  capturedAt: 1000,
  lengthErrorVisibleAtStart: false
}
const base = {
  errorKind: 'conversation_length_limit' as const,
  confidence: 'high' as const,
  turn,
  conversationKey: 'anonymous-current-chat',
  generationId: 'g1',
  observedAt: 2500
}

describe('passive conversation-length failure attribution', () => {
  it('allows only a new explicit length error attributable to an accepted same-chat turn', () => {
    expect(shouldRecordPassiveLengthFailure(base)).toBe(true)
    expect(classifyVisibleError("You've reached the maximum length for this conversation"))
      .toEqual({kind: 'conversation_length_limit', confidence: 'high'})
  })

  it('accepts explicit failed sends even before the rejected message enters the transcript', () => {
    expect(shouldRecordPassiveLengthFailure({
      ...base,turn:{...turn,accepted:false,submitted:true}
    })).toBe(true)
    expect(shouldRecordPassiveLengthFailure({
      ...base,turn:{...turn,accepted:false,submitted:false}
    })).toBe(false)
  })

  it('rejects stray or old error overlays during a project/new-chat navigation', () => {
    expect(shouldRecordPassiveLengthFailure({...base,turn:undefined})).toBe(false)
    expect(shouldRecordPassiveLengthFailure({
      ...base,conversationKey:'new-project-chat'
    })).toBe(false)
    expect(shouldRecordPassiveLengthFailure({
      ...base,turn:{
        accepted:true,generationId:'g1',capturedAt:1000,
        lengthErrorVisibleAtStart:false
      }
    })).toBe(false)
    expect(shouldRecordPassiveLengthFailure({
      ...base,turn:{...turn,accepted:false}
    })).toBe(false)
    expect(shouldRecordPassiveLengthFailure({
      ...base,turn:{...turn,lengthErrorVisibleAtStart:true}
    })).toBe(false)
  })

  it('rejects medium generalized text, unrelated errors and mismatched environments', () => {
    expect(shouldRecordPassiveLengthFailure({...base,confidence:'medium'})).toBe(false)
    expect(shouldRecordPassiveLengthFailure({...base,errorKind:'rate_limit'})).toBe(false)
    expect(shouldRecordPassiveLengthFailure({...base,generationId:'new-generation'})).toBe(false)
  })

  it('expires old user intents and disallows clock anomalies', () => {
    expect(shouldRecordPassiveLengthFailure({
      ...base,observedAt:turn.capturedAt + 15*60_000 + 1
    })).toBe(false)
    expect(shouldRecordPassiveLengthFailure({
      ...base,observedAt:turn.capturedAt - 1
    })).toBe(false)
  })
})
