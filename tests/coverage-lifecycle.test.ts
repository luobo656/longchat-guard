import { describe, expect, it } from 'vitest'
import {
  createConversationSessionState,
  enterBlankConversationRoute,
  markNewChatStarted,
  resetConversationSession,
  resolveConversationSession,
  resolveObservedConversationKey,
  resolveLiveConversationIdentity,
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

  it('does not persist observed-from-start coverage under a stale adapter canonical ID', () => {
    expect(resolveObservedConversationKey({
      activeSessionConversationId: 'bound-project-chat',
      adapterConversationKey: 'chatgpt:stale-canonical'
    })).toBe('chatgpt:bound-project-chat')
    expect(resolveObservedConversationKey({
      adapterConversationKey: 'chatgpt:first-observed-id'
    })).toBe('chatgpt:first-observed-id')
  })

  it('does not let a stale canonical/sidebar hint consume a witnessed new Project composer birth', () => {
    const born = markNewChatStarted(createConversationSessionState(), 10_000)
    const duringProjectTransition = resolveLiveConversationIdentity(born, {
      observedConversationId: 'stale-previous-project-chat',
      now: 10_500
    })
    expect(duringProjectTransition.ignoreUntrustedHints).toBe(true)
    expect(duringProjectTransition.conversationId).toBeUndefined()

    const realAssignedRoute = resolveLiveConversationIdentity(born, {
      routeConversationId: 'fresh-project-chat',
      observedConversationId: 'stale-previous-project-chat',
      now: 10_800
    })
    expect(realAssignedRoute.ignoreUntrustedHints).toBe(false)
    expect(realAssignedRoute.conversationId).toBe('fresh-project-chat')
  })

  it('continues preferring an authenticated active chat and never invents birth for directly opened old history', () => {
    const ongoing = resolveLiveConversationIdentity({
      activeConversationId: 'bound-existing',
      observedFromStartConversationId: 'bound-existing'
    }, {
      observedConversationId: 'stale-other',
      now: 20_000
    })
    expect(ongoing.ignoreUntrustedHints).toBe(false)
    expect(ongoing.conversationId).toBe('bound-existing')

    const reopened = resolveLiveConversationIdentity(createConversationSessionState(), {
      routeConversationId: 'real-old-chat',
      observedConversationId: 'left-panel-stale',
      now: 20_500
    })
    expect(reopened.conversationId).toBe('real-old-chat')
    expect(reopened.ignoreUntrustedHints).toBe(false)
  })

  it('does not promote stale same-tab birth timestamps past their evidence window', () => {
    const expired = resolveLiveConversationIdentity({
      pendingNewChatStartedAt: 10_000
    }, {
      observedConversationId: 'ordinary-history-hint',
      now: 50_000
    })
    expect(expired.ignoreUntrustedHints).toBe(false)
    expect(expired.conversationId).toBe('ordinary-history-hint')
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
  it('preserves a witnessed blank Project birth through a nonblank SPA transition without an ID', () => {
    const first = resolveConversationSession(
      createConversationSessionState(),
      {
        isBlankSurface: true,
        messageCount: 0,
        hasUserMessage: false,
        persistedAuthoritative: false,
        now: 1_000
      }
    )
    expect(first.state.blankSurfaceObserved).toBe(true)

    // Project UI moves away from /g/.../project before /c/<id> becomes
    // available. The intermediate page has no trusted conversation ID.
    const transitioning = resolveConversationSession(first.state, {
      isBlankSurface: false,
      messageCount: 0,
      hasUserMessage: false,
      persistedAuthoritative: false,
      now: 1_500
    })
    expect(transitioning.coverageEvidence).toBe('none')
    expect(transitioning.state.blankSurfaceObserved).toBe(true)

    const firstUser = resolveConversationSession(transitioning.state, {
      conversationId: 'real-project-new-chat',
      isBlankSurface: false,
      messageCount: 1,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 2_000
    })
    expect(firstUser.coverageEvidence).toBe('observed_from_start')
    expect(firstUser.activeConversationId).toBe('real-project-new-chat')

    const assistant = resolveConversationSession(firstUser.state, {
      conversationId: 'real-project-new-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 2_300
    })
    expect(assistant.coverageEvidence).toBe('observed_from_start')
  })

  it('never consumes new-chat birth against a provisional ID when the real /c route is still missing', () => {
    const started = markNewChatStarted(createConversationSessionState(), 10_000)
    const provisional = resolveConversationSession(started, {
      conversationId: 'provisional-hint',
      isBlankSurface: false,
      messageCount: 1,
      hasUserMessage: false,
      persistedAuthoritative: false,
      now: 10_200
    })
    expect(provisional.state.blankSurfaceObserved).toBe(true)

    // The first USER root appears while still on an untrusted transitional
    // Project route. The earlier provisional active ID is not authoritative:
    // wait for /c instead of certifying the first turn under the wrong key.
    const noRealIdYet = resolveConversationSession(provisional.state, {
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      ignoreUntrustedActiveId: true,
      persistedAuthoritative: false,
      now: 10_350
    })
    expect(noRealIdYet.coverageEvidence).toBe('none')
    expect(noRealIdYet.activeConversationId).toBeUndefined()
    expect(noRealIdYet.state.blankSurfaceObserved).toBe(true)
    expect(noRealIdYet.state.pendingNewChatStartedAt).toBe(10_000)

    const assigned = resolveConversationSession(noRealIdYet.state, {
      conversationId: 'actual-project-conversation',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 10_500
    })
    expect(assigned.coverageEvidence).toBe('observed_from_start')
    expect(assigned.activeConversationId).toBe('actual-project-conversation')
  })

  it('keeps a user-created Project birth when a provisional assistant/loading fragment appears before the first user root', () => {
    const started = markNewChatStarted(createConversationSessionState(), 10_000)
    const provisional = resolveConversationSession(started, {
      conversationId: 'intermediate-route-id',
      isBlankSurface: false,
      messageCount: 1,
      hasUserMessage: false,
      persistedAuthoritative: false,
      now: 10_500
    })
    expect(provisional.coverageEvidence).toBe('none')
    expect(provisional.state.pendingNewChatStartedAt).toBe(10_000)
    expect(provisional.state.observedFromStartConversationId).toBeUndefined()

    const realChat = resolveConversationSession(provisional.state, {
      conversationId: 'assigned-real-id',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 11_000
    })
    expect(realChat.coverageEvidence).toBe('observed_from_start')
    expect(realChat.state.observedFromStartConversationId).toBe('assigned-real-id')
  })

  it('does not fabricate new-birth proof for direct existing project-history route load', () => {
    const intermediate = resolveConversationSession(
      createConversationSessionState(), {
        isBlankSurface: false,
        messageCount: 0,
        hasUserMessage: false,
        persistedAuthoritative: false,
        now: 20_000
      }
    )
    const loaded = resolveConversationSession(intermediate.state, {
      conversationId: 'historical-project-chat',
      isBlankSurface: false,
      messageCount: 2,
      hasUserMessage: true,
      persistedAuthoritative: false,
      now: 20_200
    })
    expect(loaded.coverageEvidence).toBe('none')
  })

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

  it('certifies inherited branch coverage ONLY with verified prefix proof, not merely shared bodies',()=>{
    const parent=resolveConversationSession(
      markNewChatStarted(createConversationSessionState(),10000),{
        conversationId:'project-parent',isBlankSurface:false,
        messageCount:12,hasUserMessage:true,persistedAuthoritative:false,
        now:10100
      })
    const noProof=resolveConversationSession(parent.state,{
      conversationId:'project-child',isBlankSurface:false,
      messageCount:8,hasUserMessage:true,persistedAuthoritative:false,
      verifiedInheritedPrefix:false,now:12000
    })
    expect(noProof.coverageEvidence).toBe('none')
    expect(noProof.state.observedFromStartConversationId).toBeUndefined()

    const certified=resolveConversationSession(noProof.state,{
      conversationId:'project-child',isBlankSurface:false,
      messageCount:8,hasUserMessage:true,persistedAuthoritative:false,
      verifiedInheritedPrefix:true,now:13100
    })
    expect(certified.coverageEvidence).toBe('observed_from_start')
    expect(certified.state.observedFromStartConversationId).toBe('project-child')
    const ongoing=resolveConversationSession(certified.state,{
      conversationId:'project-child',isBlankSurface:false,
      messageCount:10,hasUserMessage:true,persistedAuthoritative:false,
      now:15100
    })
    expect(ongoing.coverageEvidence).toBe('observed_from_start')
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

describe('project blank route isolation', () => {
  it('drops a previous project chat identity before new blank-composer and first-turn binding', () => {
    const previous = resolveConversationSession(
      markNewChatStarted(createConversationSessionState(), 1000), {
        conversationId: 'old-project-chat', isBlankSurface: false,
        messageCount: 6, hasUserMessage: true,
        persistedAuthoritative: true, now: 1300
      }
    )
    const entered = enterBlankConversationRoute(previous.state, true, 3000)
    expect(entered.resetPreviousBinding).toBe(true)
    expect(entered.state.activeConversationId).toBeUndefined()
    expect(entered.state.observedFromStartConversationId).toBeUndefined()
    expect(entered.state.blankSurfaceObserved).toBe(true)
    const start = resolveConversationSession(entered.state, {
      isBlankSurface: true, messageCount: 0,
      hasUserMessage: false, persistedAuthoritative: false, now: 3050
    })
    const first = resolveConversationSession(start.state, {
      conversationId: 'brand-new-project-chat', isBlankSurface: false,
      messageCount: 2, hasUserMessage: true,
      persistedAuthoritative: false, now: 3450
    })
    expect(first.coverageEvidence).toBe('observed_from_start')
    expect(first.state.activeConversationId).toBe('brand-new-project-chat')
    expect(first.state.observedFromStartConversationId).toBe('brand-new-project-chat')
  })

  it('does not reset or fake birth evidence for a direct existing-chat route', () => {
    const current = resolveConversationSession(createConversationSessionState(), {
      conversationId: 'existing-opened-project-chat', isBlankSurface: false,
      messageCount: 3, hasUserMessage: true,
      persistedAuthoritative: false, now: 1200
    })
    expect(current.coverageEvidence).toBe('none')
    const notEnteringAgain = enterBlankConversationRoute(current.state, false, 1400)
    expect(notEnteringAgain.resetPreviousBinding).toBe(true)
    // enterBlankConversationRoute must only be called for a REAL blank route;
    // app.ts explicitly gates it behind isBlankConversationRoute(url).
    const pending = enterBlankConversationRoute(createConversationSessionState(), false, 2000)
    expect(pending.resetPreviousBinding).toBe(false)
    expect(pending.state).toEqual({})
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