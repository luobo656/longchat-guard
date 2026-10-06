import { describe, expect, it } from 'vitest'
import {
  createConversationSessionState,
  markNewChatStarted,
  resetConversationSession,
  resolveConversationSession,
  resolveSessionConversationId,
  shouldArmNewChatFromComposerActivity
} from '../src/content/conversation-session'
import { isAuthoritativeLedgerForEnvironment } from '../src/core/measurement-authority'
import type { PersistedConversationLedger } from '../src/core/types'

const completeLedger: PersistedConversationLedger = {
  conversationKey: 'chat',
  generationId: 'g1',
  ledgerRevision: 1,
  observationEpoch: 1,
  coverageState: 'complete',
  parserHealth: 'healthy',
  messages: [],
  activeFingerprints: [],
  sequenceReliability: 'reliable',
  currentEstimatedLoad: 100,
  uncertaintySources: [],
  environmentSignature: {
    parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
    measurementSchemaVersion: 2,
    modelHint: 'diagnostic-only'
  },
  completedAssistantFingerprints: [],
  confirmedFailureFingerprints: [],
  dismissedFailureKeys: [],
  updatedAt: 1
}

describe('conversation identity source precedence', () => {
  it('does not let a transient DOM hint replace an already bound conversation', () => {
    expect(
      resolveSessionConversationId({
        activeConversationId: 'current-chat',
        observedConversationId: 'sidebar-chat'
      })
    ).toBe('current-chat')
  })

  it('allows an explicit /c route to replace the previous session identity', () => {
    expect(
      resolveSessionConversationId({
        activeConversationId: 'current-chat',
        routeConversationId: 'navigated-chat',
        observedConversationId: 'sidebar-chat'
      })
    ).toBe('navigated-chat')
  })
})

describe('new-chat composer activity', () => {
  it('arms new-chat evidence on a zero-message no-ledger composer surface', () => {
    expect(
      shouldArmNewChatFromComposerActivity({
        messageCount: 0,
        composerHasText: true,
        hasPersistedLedger: false
      })
    ).toBe(true)
  })

  it('does not arm after messages already exist or for a persisted chat', () => {
    expect(
      shouldArmNewChatFromComposerActivity({
        messageCount: 1,
        composerHasText: true,
        hasPersistedLedger: false
      })
    ).toBe(false)
    expect(
      shouldArmNewChatFromComposerActivity({
        messageCount: 0,
        composerHasText: true,
        hasPersistedLedger: true
      })
    ).toBe(false)
  })
})

describe('conversation session lifecycle', () => {
  it('binds an SPA-created chat from a blank surface even if the send control is not recognized', () => {
    const blank = resolveConversationSession(
      createConversationSessionState(),
      {
        isBlankSurface: true,
        messageCount: 0,
        hasUserMessage: false,
        persistedAuthoritative: false,
        now: 9_000
      }
    )
    expect(blank.state.blankSurfaceObserved).toBe(true)

    const bound = resolveConversationSession(blank.state, {
      conversationId: 'spa-new-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 10_000
    })
    expect(bound.coverageEvidence).toBe('observed_from_start')
    expect(bound.state.observedFromStartConversationId).toBe(
      'spa-new-chat'
    )
  })

  it('keeps blank-surface evidence when a send intent is captured', () => {
    const started = markNewChatStarted(
      createConversationSessionState(),
      10_000
    )

    expect(started.blankSurfaceObserved).toBe(true)
    expect(started.pendingNewChatStartedAt).toBe(10_000)
  })

  it('binds a real blank-chat send to the first conversation id and keeps observed-from-start monotonic', () => {
    let state = markNewChatStarted(createConversationSessionState(), 10_000)

    const beforeUser = resolveConversationSession(state, {
      conversationId: 'new-chat',
      isBlankSurface: false,
      messageCount: 0,
      hasUserMessage: false,
      persistedAuthoritative: false,
      now: 10_100
    })
    state = beforeUser.state
    expect(beforeUser.coverageEvidence).toBe('none')

    const firstTurn = resolveConversationSession(state, {
      conversationId: 'new-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 10_300
    })
    state = firstTurn.state
    expect(firstTurn.coverageEvidence).toBe('observed_from_start')
    expect(state.observedFromStartConversationId).toBe('new-chat')

    const settled = resolveConversationSession(state, {
      conversationId: 'new-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 20_000
    })
    expect(settled.coverageEvidence).toBe('observed_from_start')
    expect(settled.state.observedFromStartConversationId).toBe('new-chat')
  })

  it('does not reinterpret a transient empty DOM frame as a new blank chat after identity is bound', () => {
    const bound = resolveConversationSession(
      markNewChatStarted(createConversationSessionState(), 10_000),
      {
        conversationId: 'new-chat',
        isBlankSurface: false,
        messageCount: 2,
        hasUserMessage: true,
        persistedAuthoritative: false,
        now: 10_100
      }
    )

    const emptyFrame = resolveConversationSession(bound.state, {
      isBlankSurface: true,
      messageCount: 0,
      hasUserMessage: false,
      persistedAuthoritative: true,
      now: 11_000
    })

    expect(emptyFrame.activeConversationId).toBe('new-chat')
    expect(emptyFrame.coverageEvidence).toBe('observed_from_start')
    expect(emptyFrame.state.observedFromStartConversationId).toBe(
      'new-chat'
    )
  })

  it('keeps the bound identity through a transient observation that cannot resolve a conversation id', () => {
    const bound = resolveConversationSession(
      markNewChatStarted(createConversationSessionState(), 10_000),
      {
        conversationId: 'new-chat',
        isBlankSurface: false,
        messageCount: 2,
        hasUserMessage: true,
        persistedAuthoritative: false,
        now: 10_100
      }
    )

    const transient = resolveConversationSession(bound.state, {
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: true,
      now: 11_000
    })

    expect(transient.activeConversationId).toBe('new-chat')
    expect(transient.coverageEvidence).toBe('observed_from_start')
  })

  it('transfers observed-from-start coverage across an in-place identity rebind only with continuity evidence', () => {
    const bound = resolveConversationSession(
      markNewChatStarted(createConversationSessionState(), 10_000),
      {
        conversationId: 'provisional-chat',
        isBlankSurface: false,
        messageCount: 1,
        hasUserMessage: true,
        persistedAuthoritative: false,
        now: 10_100
      }
    )

    const rebound = resolveConversationSession(bound.state, {
      conversationId: 'canonical-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      sameConversationEvidence: true,
      now: 11_000
    })

    expect(rebound.activeConversationId).toBe('canonical-chat')
    expect(rebound.coverageEvidence).toBe('observed_from_start')
    expect(rebound.state.observedFromStartConversationId).toBe(
      'canonical-chat'
    )
  })

  it('does not transfer observed-from-start coverage to a different conversation', () => {
    const bound = resolveConversationSession(
      markNewChatStarted(createConversationSessionState(), 10_000),
      {
        conversationId: 'new-chat',
        isBlankSurface: false,
        messageCount: 2,
        hasUserMessage: true,
        persistedAuthoritative: false,
        now: 10_100
      }
    )

    const history = resolveConversationSession(bound.state, {
      conversationId: 'old-chat',
      isBlankSurface: false,
      messageCount: 8,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 11_000
    })

    expect(history.activeConversationId).toBe('old-chat')
    expect(history.coverageEvidence).toBe('none')
    expect(history.state.observedFromStartConversationId).toBeUndefined()
  })

  it('uses persisted authoritative coverage after a reload without pretending the chat was observed from start', () => {
    const reloaded = resolveConversationSession(
      createConversationSessionState(),
      {
        conversationId: 'existing-chat',
        isBlankSurface: false,
        messageCount: 4,
        hasUserMessage: true,
        persistedAuthoritative: true,
        now: 20_000
      }
    )

    expect(reloaded.coverageEvidence).toBe('persisted_complete')
    expect(reloaded.state.observedFromStartConversationId).toBeUndefined()
  })

  it('uses the same-tab bridge only for a recent new-chat start and consumes it on bind', () => {
    const bridged = resolveConversationSession(
      createConversationSessionState(),
      {
        conversationId: 'hard-nav-chat',
        isBlankSurface: false,
        messageCount: 2,
        hasUserMessage: true,
        persistedAuthoritative: false,
        bridgedNewChatStartedAt: 10_000,
        now: 20_000
      }
    )
    expect(bridged.coverageEvidence).toBe('observed_from_start')
    expect(bridged.consumedBridgedStart).toBe(true)

    const expired = resolveConversationSession(
      createConversationSessionState(),
      {
        conversationId: 'old-chat',
        isBlankSurface: false,
        messageCount: 2,
        hasUserMessage: true,
        persistedAuthoritative: false,
        bridgedNewChatStartedAt: 10_000,
        now: 50_001
      }
    )
    expect(expired.coverageEvidence).toBe('none')
  })

  it('clears all current-chat identity when explicit navigation resets the session', () => {
    const reset = resetConversationSession()
    expect(reset.activeConversationId).toBeUndefined()
    expect(reset.observedFromStartConversationId).toBeUndefined()
    expect(reset.pendingNewChatStartedAt).toBeUndefined()
    expect(reset.blankSurfaceObserved).toBeUndefined()
  })
})

describe('persisted measurement authority', () => {
  it('reuses a complete old-chat measurement only when generation and measurement ruler still match', () => {
    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: completeLedger,
        generationId: 'g1',
        environmentSignature: {
          parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
          measurementSchemaVersion: 2
        }
      })
    ).toBe(true)

    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: completeLedger,
        generationId: 'g2',
        environmentSignature: {
          parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
          measurementSchemaVersion: 2
        }
      })
    ).toBe(false)

    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: completeLedger,
        generationId: 'g1',
        environmentSignature: {
          parserSchemaVersion: 'chatgpt-dom-2026-10-v4',
          measurementSchemaVersion: 2
        }
      })
    ).toBe(false)

    expect(
      isAuthoritativeLedgerForEnvironment({
        ledger: { ...completeLedger, parserHealth: 'degraded' },
        generationId: 'g1',
        environmentSignature: {
          parserSchemaVersion: 'chatgpt-dom-2026-10-v3',
          measurementSchemaVersion: 2
        }
      })
    ).toBe(false)
  })
})