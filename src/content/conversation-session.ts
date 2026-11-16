export const NEW_CHAT_START_EVIDENCE_TTL_MS = 30_000

export interface ConversationSessionState {
  activeConversationId?: string
  observedFromStartConversationId?: string
  pendingNewChatStartedAt?: number
  blankSurfaceObserved?: boolean
}

export interface ConversationSessionObservation {
  conversationId?: string | undefined
  isBlankSurface: boolean
  messageCount: number
  hasUserMessage: boolean
  persistedAuthoritative: boolean
  sameConversationEvidence?: boolean | undefined
  verifiedInheritedPrefix?: boolean | undefined
  bridgedNewChatStartedAt?: number | undefined
  ignoreUntrustedActiveId?: boolean | undefined
  now: number
}

export interface ConversationSessionResolution {
  state: ConversationSessionState
  coverageEvidence: 'observed_from_start' | 'persisted_complete' | 'none'
  activeConversationId?: string
  consumedBridgedStart: boolean
}

export function createConversationSessionState(): ConversationSessionState {
  return {}
}

export function markNewChatStarted(
  state: ConversationSessionState,
  capturedAt: number
): ConversationSessionState {
  return {
    blankSurfaceObserved: true,
    pendingNewChatStartedAt: capturedAt
  }
}

export function resetConversationSession(): ConversationSessionState {
  return {}
}

/** Explicitly entering a blank composer route invalidates an old chat ID.
 * Preserve existing pending birth evidence when already in a blank session.
 */
export function enterBlankConversationRoute(
  state: ConversationSessionState,
  hasPreviousConversationBinding: boolean,
  now: number
): { state: ConversationSessionState; resetPreviousBinding: boolean } {
  if (!state.activeConversationId && !hasPreviousConversationBinding) {
    return { state, resetPreviousBinding: false }
  }
  return {
    state: markNewChatStarted(resetConversationSession(), now),
    resetPreviousBinding: true
  }
}

export function shouldArmNewChatFromComposerActivity(input: {
  messageCount: number
  composerHasText: boolean
  hasPersistedLedger: boolean
}): boolean {
  return (
    input.messageCount === 0 &&
    input.composerHasText &&
    !input.hasPersistedLedger
  )
}

export function resolveSessionConversationId(input: {
  activeConversationId?: string | undefined
  routeConversationId?: string | undefined
  observedConversationId?: string | undefined
}): string | undefined {
  if (input.routeConversationId) return input.routeConversationId
  if (input.activeConversationId) return input.activeConversationId
  return input.observedConversationId
}

/**
 * A fresh Project chat can traverse a non-/c URL while its DOM still carries
 * an old canonical or conversation-id hint. Never spend our verified blank
 * composer birth on that unrelated identity; the next real /c route is the
 * authoritative ID. This returns both the ID and a directive to remove
 * untrusted hints from the matching PageAdapter snapshot.
 */
export function resolveLiveConversationIdentity(
  state: ConversationSessionState,
  input: {
    routeConversationId?: string | undefined
    observedConversationId?: string | undefined
    now: number
  }
): { conversationId?: string; ignoreUntrustedHints: boolean } {
  const recentBirth = recentTimestamp(
    state.pendingNewChatStartedAt,
    input.now
  ) !== undefined
  const awaitingNewChatId = (
    state.observedFromStartConversationId === undefined &&
    (state.blankSurfaceObserved === true || recentBirth)
  )
  const ignoreUntrustedHints = (
    awaitingNewChatId && !input.routeConversationId
  )
  const conversationId = resolveSessionConversationId({
    ...(ignoreUntrustedHints
      ? {}
      : {
          activeConversationId: state.activeConversationId,
          observedConversationId: input.observedConversationId
        }),
    routeConversationId: input.routeConversationId
  })
  return {
    ...(conversationId ? { conversationId } : {}),
    ignoreUntrustedHints
  }
}

/** Coverage evidence and the persisted ledger must use the SAME identity.
 * Once a session is bound, a stale canonical DOM hint cannot override it.
 */
export function resolveObservedConversationKey(input: {
  activeSessionConversationId?: string | undefined
  adapterConversationKey?: string | undefined
}): string | undefined {
  return input.activeSessionConversationId
    ? `chatgpt:${input.activeSessionConversationId}`
    : input.adapterConversationKey
}

export function resolveConversationSession(
  state: ConversationSessionState,
  observation: ConversationSessionObservation
): ConversationSessionResolution {
  const localStart = recentTimestamp(
    state.pendingNewChatStartedAt,
    observation.now
  )
  const bridgedStart = recentTimestamp(
    observation.bridgedNewChatStartedAt,
    observation.now
  )
  const pendingNewChatStartedAt = newerTimestamp(localStart, bridgedStart)

  if (observation.isBlankSurface) {
    if (state.activeConversationId) {
      const observedFromStart =
        state.observedFromStartConversationId ===
        state.activeConversationId
      return {
        state,
        activeConversationId: state.activeConversationId,
        coverageEvidence: observedFromStart
          ? 'observed_from_start'
          : observation.persistedAuthoritative
            ? 'persisted_complete'
            : 'none',
        consumedBridgedStart: false
      }
    }

    const next: ConversationSessionState = {
      blankSurfaceObserved: true,
      ...(pendingNewChatStartedAt !== undefined
        ? { pendingNewChatStartedAt }
        : {})
    }
    return {
      state: next,
      coverageEvidence: 'none',
      consumedBridgedStart: false
    }
  }

  const conversationId = observation.conversationId ??
    (observation.ignoreUntrustedActiveId
      ? undefined
      : state.activeConversationId)

  if (!conversationId) {
    // A blank Project composer remains a witnessed new-chat origin while
    // the SPA visits intermediate routes without a trustworthy /c ID.
    return {
      state: {
        ...(state.blankSurfaceObserved === true
          ? { blankSurfaceObserved: true }
          : {}),
        ...(pendingNewChatStartedAt !== undefined
          ? { pendingNewChatStartedAt }
          : {})
      },
      coverageEvidence: 'none',
      consumedBridgedStart: false
    }
  }

  const sameIdentity = state.activeConversationId === conversationId
  const alreadyObservedFromStart =
    state.observedFromStartConversationId === conversationId
  const canTransferObservedFromStart =
    !sameIdentity &&
    observation.sameConversationEvidence === true &&
    state.observedFromStartConversationId ===
      state.activeConversationId
  const canBindNewChatStart =
    observation.hasUserMessage &&
    (
      pendingNewChatStartedAt !== undefined ||
      state.blankSurfaceObserved === true
    )

  const observedFromStart =
    alreadyObservedFromStart ||
    canTransferObservedFromStart ||
    canBindNewChatStart ||
    observation.verifiedInheritedPrefix === true

  // A loading or assistant fragment can render before the first USER root.
  // Its presence cannot consume a known first-send origin.
  const keepBirthCandidate =
    !canBindNewChatStart && !observation.hasUserMessage
  const keepPendingStart =
    keepBirthCandidate && pendingNewChatStartedAt !== undefined

  const next: ConversationSessionState = {
    activeConversationId: conversationId,
    ...(observedFromStart
      ? { observedFromStartConversationId: conversationId }
      : {}),
    ...(keepPendingStart
      ? { pendingNewChatStartedAt }
      : {}),
    ...(keepBirthCandidate && state.blankSurfaceObserved === true
      ? { blankSurfaceObserved: true }
      : {})
  }

  const coverageEvidence = observedFromStart
    ? 'observed_from_start'
    : observation.persistedAuthoritative
      ? 'persisted_complete'
      : 'none'

  return {
    state: next,
    activeConversationId: conversationId,
    coverageEvidence,
    consumedBridgedStart:
      Boolean(bridgedStart !== undefined && canBindNewChatStart) &&
      (!sameIdentity || !alreadyObservedFromStart)
  }
}

function recentTimestamp(
  capturedAt: number | undefined,
  now: number
): number | undefined {
  if (capturedAt === undefined || !Number.isFinite(capturedAt)) {
    return undefined
  }
  const age = now - capturedAt
  return age >= 0 && age <= NEW_CHAT_START_EVIDENCE_TTL_MS
    ? capturedAt
    : undefined
}

function newerTimestamp(
  left: number | undefined,
  right: number | undefined
): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}