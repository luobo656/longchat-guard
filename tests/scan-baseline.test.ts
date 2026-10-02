import { describe, expect, it } from 'vitest'
import { deriveScanSafeCompletion } from '../src/content/app'
import type { MessageRecord } from '../src/core/types'

function message(
  fingerprint: string,
  role: MessageRecord['role'],
  tokenEstimate: number
): Pick<MessageRecord, 'fingerprint' | 'role' | 'tokenEstimate'> {
  return { fingerprint, role, tokenEstimate }
}

describe('scan baseline derivation', () => {
  it('uses the last completed assistant turn as the immediate safe baseline', () => {
    const result = deriveScanSafeCompletion([
      message('u1', 'user', 100),
      message('a1', 'assistant', 200),
      message('u2', 'user', 50)
    ])

    expect(result).toEqual({
      assistantFingerprint: 'a1',
      assistantTokenCount: 200,
      estimatedLoad: 300
    })
  })

  it('uses cumulative load through the latest assistant when several turns exist', () => {
    const result = deriveScanSafeCompletion([
      message('u1', 'user', 100),
      message('a1', 'assistant', 200),
      message('u2', 'user', 50),
      message('a2', 'assistant', 400)
    ])

    expect(result).toEqual({
      assistantFingerprint: 'a2',
      assistantTokenCount: 400,
      estimatedLoad: 750
    })
  })

  it('does not invent a safe completion when no assistant response exists', () => {
    expect(
      deriveScanSafeCompletion([
        message('u1', 'user', 100),
        message('u2', 'user', 50)
      ])
    ).toBeUndefined()
  })
})
