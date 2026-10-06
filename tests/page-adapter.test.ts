import { describe, expect, it } from 'vitest'
import {
  analyzePageSnapshot,
  resolveConversationId
} from '../src/core/page-adapter'

describe('chatgpt.com page adapter', () => {
  it('extracts a healthy semantic conversation fixture', () => {
    const result = analyzePageSnapshot({
      url: 'https://chatgpt.com/c/abc123456789',
      conversationIdHints: [],
      messages: [
        {
          role: 'user',
          text: 'Please explain the plan.',
          ordinalHint: 0,
          semanticScore: 0.95,
          hasCode: false,
          attachmentCount: 0
        },
        {
          role: 'assistant',
          text: 'Here is the plan.',
          ordinalHint: 1,
          semanticScore: 0.95,
          hasCode: false,
          attachmentCount: 0
        }
      ],
      composerText: 'draft only',
      visibleErrors: [],
      coverageEvidence: 'observed_from_start',
      generationState: 'unknown',
      tailEvidence: 'at_tail'
    })

    expect(result.conversationKey).toBe('chatgpt:abc123456789')
    expect(result.health).toBe('healthy')
    expect(result.coverageState).toBe('complete')
    expect(result.messages).toHaveLength(2)
  })

  it('marks opened existing conversations incomplete without lifecycle evidence', () => {
    const result = analyzePageSnapshot({
      url: 'https://chatgpt.com/c/existing123',
      conversationIdHints: [],
      messages: [
        {
          role: 'assistant',
          text: 'Visible tail of an older conversation.',
          ordinalHint: 4,
          semanticScore: 0.8,
          hasCode: false,
          attachmentCount: 0
        }
      ],
      visibleErrors: [],
      coverageEvidence: 'none',
      generationState: 'unknown',
      tailEvidence: 'unknown'
    })

    expect(result.health).toBe('healthy')
    expect(result.coverageState).toBe('incomplete')
  })

  it('extracts conversation ids from nested ChatGPT routes', () => {
    const result = analyzePageSnapshot({
      url: 'https://chatgpt.com/g/g-example/c/nested123456',
      conversationIdHints: [],
      messages: [
        {
          role: 'assistant',
          text: 'Existing conversation.',
          ordinalHint: 0,
          semanticScore: 0.9,
          hasCode: false,
          attachmentCount: 0
        }
      ],
      visibleErrors: [],
      coverageEvidence: 'none',
      generationState: 'idle',
      tailEvidence: 'unknown'
    })

    expect(result.conversationKey).toBe('chatgpt:nested123456')
  })

  it('resolves conversation identity independently from message parser health', () => {
    expect(
      resolveConversationId({
        url: 'https://chatgpt.com/workspace/current',
        conversationIdHints: ['identity123456']
      })
    ).toBe('identity123456')
    expect(
      resolveConversationId({
        url: 'https://chatgpt.com/c/url123456',
        conversationIdHints: ['different123456']
      })
    ).toBe('url123456')
  })

  it('fails closed when conversation identity is not reliable', () => {
    const result = analyzePageSnapshot({
      url: 'https://example.com/c/abc',
      conversationIdHints: [],
      messages: [],
      visibleErrors: [],
      coverageEvidence: 'none',
      generationState: 'unknown',
      tailEvidence: 'unknown'
    })

    expect(result.health).toBe('unreliable')
    expect(result.coverageState).toBe('unknown')
  })

  it('does not create a shared persistent key for root new chat pages', () => {
    const result = analyzePageSnapshot({
      url: 'https://chatgpt.com/',
      conversationIdHints: [],
      messages: [],
      visibleErrors: [],
      coverageEvidence: 'observed_from_start',
      generationState: 'unknown',
      tailEvidence: 'unknown'
    })

    expect(result.conversationKey).toBeUndefined()
    expect(result.health).toBe('unreliable')
  })
})