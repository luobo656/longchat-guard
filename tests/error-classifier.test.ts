import { describe, expect, it } from 'vitest'
import { classifyVisibleError } from '../src/core/error-classifier'

describe('error classifier', () => {
  it('recognizes explicit conversation-length failures', () => {
    expect(
      classifyVisibleError("You've reached the maximum length for this conversation")
        .kind
    ).toBe('conversation_length_limit')
  })

  it('does not confuse usage limits with conversation length', () => {
    expect(classifyVisibleError('You have reached your message limit').kind).toBe(
      'model_usage_limit'
    )
  })
})
