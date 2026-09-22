import { describe, expect, it } from 'vitest'
import { ResponseCompletionTracker } from '../src/core/response-completion-tracker'

describe('response completion tracker', () => {
  it('does not complete a directly observed historical assistant tail on first sight', () => {
    const tracker = new ResponseCompletionTracker(2500)
    const result = tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'old',
      tokenEstimate: 10,
      observedAt: 0,
      generationState: 'unknown',
      hasLengthError: false
    })

    expect(result.state).toBe('pending')
  })

  it('waits through streaming changes and completes only once after stability', () => {
    const tracker = new ResponseCompletionTracker(2500)
    expect(tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'short',
      tokenEstimate: 10,
      observedAt: 0,
      generationState: 'unknown',
      hasLengthError: false
    }).state).toBe('pending')
    expect(tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'long',
      tokenEstimate: 100,
      observedAt: 1000,
      generationState: 'unknown',
      hasLengthError: false
    }).state).toBe('pending')
    expect(tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'long',
      tokenEstimate: 100,
      observedAt: 3600,
      generationState: 'unknown',
      hasLengthError: false
    }).state).toBe('completed')
    expect(tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'long',
      tokenEstimate: 100,
      observedAt: 6200,
      generationState: 'unknown',
      hasLengthError: false
    }).state).toBe('pending')
  })

  it('does not complete while stop-generation control is present', () => {
    const tracker = new ResponseCompletionTracker(100)
    tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'same',
      tokenEstimate: 10,
      observedAt: 0,
      generationState: 'generating',
      hasLengthError: false
    })

    expect(tracker.observe({
      assistantFingerprint: 'a1',
      role: 'assistant',
      contentFingerprint: 'same',
      tokenEstimate: 10,
      observedAt: 1000,
      generationState: 'generating',
      hasLengthError: false
    }).state).toBe('pending')
  })
})
